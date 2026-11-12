package vaultkeeper

import (
	"crypto/sha256"
	"encoding/binary"
	"strings"
	"time"
)

// OrderKey derives nonce + expiry from intent only. Same intent in the same ttl bucket = same order hash,
// so a restart resubmits the identical order and exchange filled[hash] caps it at one fill.
func OrderKey(vault string, o Order, from int64, attempt int, now time.Time, ttl time.Duration) (nonce, expiryMs uint64) {
	sec := int64(ttl / time.Second)
	if sec <= 0 {
		sec = 60
	}
	expiry := uint64((now.Unix()/sec + 2) * sec)
	var b [38]byte
	binary.BigEndian.PutUint32(b[0:], o.Market)
	binary.BigEndian.PutUint64(b[4:], uint64(o.Size))
	binary.BigEndian.PutUint64(b[12:], uint64(from))
	binary.BigEndian.PutUint64(b[20:], uint64(attempt))
	binary.BigEndian.PutUint64(b[28:], expiry)
	b[36], b[37] = flag(o.Buy), flag(o.ReduceOnly)
	h := sha256.Sum256(append([]byte(strings.ToLower(vault)), b[:]...))
	return binary.BigEndian.Uint64(h[:8]) | 1, expiry * 1000
}

func flag(b bool) byte {
	if b {
		return 1
	}
	return 0
}
