package near

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// Client is a minimal NEAR JSON-RPC client.
type Client struct {
	URL  string
	HTTP *http.Client
}

func NewClient(url string) *Client { return &Client{URL: url, HTTP: http.DefaultClient} }

// RPCError is a JSON-RPC error; Cause.Name e.g. TIMEOUT_ERROR, HANDLER_ERROR.
type RPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
	Cause   struct {
		Name string          `json:"name"`
		Info json.RawMessage `json:"info"`
	} `json:"cause"`
}

func (e *RPCError) Error() string {
	return fmt.Sprintf("near rpc %d %s %s: %s", e.Code, e.Cause.Name, e.Message, e.Data)
}

// Call does one JSON-RPC request and decodes result into out.
func (c *Client) Call(ctx context.Context, method string, params, out any) error {
	body, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": "maas", "method": method, "params": params})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var r struct {
		Result json.RawMessage `json:"result"`
		Error  *RPCError       `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return fmt.Errorf("near rpc %s: http %d: %w", method, res.StatusCode, err)
	}
	if r.Error != nil {
		return r.Error
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(r.Result, out)
}

// View calls a view method at final finality; args JSON-encoded, result JSON-decoded into out.
func (c *Client) View(ctx context.Context, contract, method string, args, out any) error {
	if args == nil {
		args = map[string]any{}
	}
	a, err := json.Marshal(args)
	if err != nil {
		return err
	}
	var r struct {
		Result []byte `json:"-"`
		Raw    []int  `json:"result"`
		Error  string `json:"error"`
	}
	err = c.Call(ctx, "query", map[string]any{
		"request_type": "call_function", "finality": "final",
		"account_id": contract, "method_name": method, "args_base64": base64.StdEncoding.EncodeToString(a),
	}, &r)
	if err != nil {
		return err
	}
	if r.Error != "" {
		return fmt.Errorf("near view %s.%s: %s", contract, method, r.Error)
	}
	b := make([]byte, len(r.Raw))
	for i, v := range r.Raw {
		b[i] = byte(v)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(b, out)
}

// AccessKey returns the key's current nonce and the final block hash it was read at.
func (c *Client) AccessKey(ctx context.Context, account, publicKey string) (nonce uint64, blockHash string, err error) {
	var r struct {
		Nonce     uint64 `json:"nonce"`
		BlockHash string `json:"block_hash"`
		Error     string `json:"error"`
	}
	err = c.Call(ctx, "query", map[string]any{
		"request_type": "view_access_key", "finality": "final", "account_id": account, "public_key": publicKey,
	}, &r)
	if err == nil && r.Error != "" {
		err = errors.New("near access key: " + r.Error)
	}
	return r.Nonce, r.BlockHash, err
}

// BlockHeight returns the height of block hash (base58).
func (c *Client) BlockHeight(ctx context.Context, hash string) (uint64, error) {
	var r struct {
		Header struct {
			Height uint64 `json:"height"`
		} `json:"header"`
	}
	err := c.Call(ctx, "block", map[string]any{"block_id": hash}, &r)
	return r.Header.Height, err
}
