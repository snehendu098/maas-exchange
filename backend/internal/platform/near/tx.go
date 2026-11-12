package near

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/mr-tron/base58"
)

const (
	TGas   uint64 = 1_000_000_000_000
	MaxGas        = 300 * TGas
)

// OneYocto is the 1 yoctoNEAR deposit NEP-141 transfers require.
var OneYocto = big.NewInt(1)

// FunctionCall is one contract call action.
type FunctionCall struct {
	Method  string
	Args    []byte // JSON
	Gas     uint64
	Deposit *big.Int // yoctoNEAR, nil = 0
}

// EncodeTx borsh-encodes a single-FunctionCall Transaction (v0).
func EncodeTx(signer string, pk ed25519.PublicKey, nonce uint64, receiver string, blockHash [32]byte, fc FunctionCall) []byte {
	var b Borsh
	b.String(signer)
	b.U8(0) // KeyType::ED25519
	b.Write(pk)
	b.U64(nonce)
	b.String(receiver)
	b.Write(blockHash[:])
	b.U32(1) // actions len
	b.U8(2)  // Action::FunctionCall
	b.String(fc.Method)
	b.Vec(fc.Args)
	b.U64(fc.Gas)
	b.BigU128(fc.Deposit)
	return b.Bytes()
}

// SignTx returns borsh(SignedTransaction) and the base58 tx hash.
func SignTx(tx []byte, key ed25519.PrivateKey) (raw []byte, hash string) {
	h := sha256.Sum256(tx)
	var b Borsh
	b.Write(tx)
	b.U8(0)
	b.Write(ed25519.Sign(key, h[:]))
	return b.Bytes(), base58.Encode(h[:])
}

// SignedTx is a ready-to-broadcast tx.
type SignedTx struct {
	Raw   []byte
	Hash  string
	Nonce uint64
}

// Signer signs and sends txs for one account + full access key.
type Signer struct {
	Client  *Client
	Account string
	Key     ed25519.PrivateKey

	mu    sync.Mutex
	nonce uint64
}

func NewSigner(c *Client, account, key string) (*Signer, error) {
	if account == "" {
		return nil, errors.New("near: signer account unset")
	}
	k, err := ParsePrivateKey(key)
	if err != nil {
		return nil, err
	}
	return &Signer{Client: c, Account: account, Key: k}, nil
}

func (s *Signer) PublicKey() ed25519.PublicKey { return s.Key.Public().(ed25519.PublicKey) }

// Sign builds a FunctionCall tx to receiver with a fresh nonce + final block hash.
func (s *Signer) Sign(ctx context.Context, receiver string, fc FunctionCall) (SignedTx, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, bh, err := s.Client.AccessKey(ctx, s.Account, PublicKeyString(s.PublicKey()))
	if err != nil {
		return SignedTx{}, err
	}
	hb, err := base58.Decode(bh)
	if err != nil || len(hb) != 32 {
		return SignedTx{}, fmt.Errorf("near: bad block hash %q", bh)
	}
	s.nonce = max(s.nonce, n) + 1
	raw, hash := SignTx(EncodeTx(s.Account, s.PublicKey(), s.nonce, receiver, [32]byte(hb), fc), s.Key)
	return SignedTx{raw, hash, s.nonce}, nil
}

// Call signs, sends and waits for fc; errors on tx/receipt failure.
func (s *Signer) Call(ctx context.Context, receiver string, fc FunctionCall) (*Outcome, error) {
	tx, err := s.Sign(ctx, receiver, fc)
	if err != nil {
		return nil, err
	}
	o, err := s.Broadcast(ctx, tx)
	if err != nil {
		return o, err
	}
	return o, o.Err()
}

// Broadcast sends tx and waits (2m) for FINAL; on rpc timeout polls tx status.
func (s *Signer) Broadcast(ctx context.Context, tx SignedTx) (*Outcome, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	var o Outcome
	err := s.Client.Call(ctx, "send_tx", map[string]any{
		"signed_tx_base64": base64.StdEncoding.EncodeToString(tx.Raw), "wait_until": "FINAL",
	}, &o)
	for retryable(err) {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
		o, err = Outcome{}, s.Client.Call(ctx, "tx", map[string]any{
			"tx_hash": tx.Hash, "sender_account_id": s.Account, "wait_until": "FINAL",
		}, &o)
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

// Status fetches a tx outcome by hash (nil, nil if unknown to the node).
func (s *Signer) Status(ctx context.Context, hash string) (*Outcome, error) {
	var o Outcome
	err := s.Client.Call(ctx, "tx", map[string]any{"tx_hash": hash, "sender_account_id": s.Account, "wait_until": "FINAL"}, &o)
	var re *RPCError
	if errors.As(err, &re) && re.Cause.Name == "UNKNOWN_TRANSACTION" {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func retryable(err error) bool {
	var re *RPCError
	return errors.As(err, &re) && (re.Cause.Name == "TIMEOUT_ERROR" || re.Cause.Name == "UNKNOWN_TRANSACTION")
}

// Outcome is a FinalExecutionOutcome (fields used here only).
type Outcome struct {
	Status      map[string]json.RawMessage `json:"status"`
	Transaction struct {
		Hash string `json:"hash"`
	} `json:"transaction"`
	TransactionOutcome struct {
		BlockHash string `json:"block_hash"`
	} `json:"transaction_outcome"`
	ReceiptsOutcome []struct {
		BlockHash string `json:"block_hash"`
		Outcome   struct {
			Logs   []string                   `json:"logs"`
			Status map[string]json.RawMessage `json:"status"`
		} `json:"outcome"`
	} `json:"receipts_outcome"`
}

// Err is non-nil if the tx or any receipt failed.
func (o *Outcome) Err() error {
	if f, ok := o.Status["Failure"]; ok {
		return fmt.Errorf("near tx %s failed: %s", o.Transaction.Hash, f)
	}
	for _, r := range o.ReceiptsOutcome {
		if f, ok := r.Outcome.Status["Failure"]; ok {
			return fmt.Errorf("near tx %s receipt failed: %s", o.Transaction.Hash, f)
		}
	}
	return nil
}

// Value decodes the tx SuccessValue JSON into out.
func (o *Outcome) Value(out any) error {
	v, ok := o.Status["SuccessValue"]
	if !ok {
		return fmt.Errorf("near tx %s: no success value", o.Transaction.Hash)
	}
	var b64 string
	if err := json.Unmarshal(v, &b64); err != nil {
		return err
	}
	b, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

// Logs returns every receipt log line in order.
func (o *Outcome) Logs() []string {
	var out []string
	for _, r := range o.ReceiptsOutcome {
		out = append(out, r.Outcome.Logs...)
	}
	return out
}

// Args JSON-encodes v for FunctionCall.Args (nil = {}).
func Args(v any) []byte {
	if v == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("near: args: %v", err)) // only plain structs/maps passed
	}
	return b
}

// LastBlockHash is the block of the final receipt (where its events landed).
func (o *Outcome) LastBlockHash() string {
	if n := len(o.ReceiptsOutcome); n > 0 {
		return o.ReceiptsOutcome[n-1].BlockHash
	}
	return o.TransactionOutcome.BlockHash
}
