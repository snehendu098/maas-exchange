package near

import (
	"bytes"
	"encoding/binary"
	"math/big"
)

// Borsh is a minimal borsh encoder (LE ints, u32-len strings/vecs).
type Borsh struct{ bytes.Buffer }

func (b *Borsh) U8(v uint8)   { b.WriteByte(v) }
func (b *Borsh) U32(v uint32) { b.Write(binary.LittleEndian.AppendUint32(nil, v)) }
func (b *Borsh) U64(v uint64) { b.Write(binary.LittleEndian.AppendUint64(nil, v)) }

func (b *Borsh) Bool(v bool) {
	if v {
		b.U8(1)
	} else {
		b.U8(0)
	}
}

// U128 writes v (< 2^64) as 16 LE bytes.
func (b *Borsh) U128(v uint64) { b.U64(v); b.U64(0) }

// BigU128 writes v (nil = 0, must fit 128 bits) as 16 LE bytes.
func (b *Borsh) BigU128(v *big.Int) {
	var out [16]byte
	if v != nil {
		be := v.Bytes()
		for i := range be {
			out[i] = be[len(be)-1-i]
		}
	}
	b.Write(out[:])
}

func (b *Borsh) String(s string) { b.U32(uint32(len(s))); b.WriteString(s) }
func (b *Borsh) Vec(p []byte)    { b.U32(uint32(len(p))); b.Write(p) }
