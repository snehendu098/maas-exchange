package near

import "regexp"

var accountRe = regexp.MustCompile(`^(([a-z\d]+[\-_])*[a-z\d]+\.)*([a-z\d]+[\-_])*[a-z\d]+$`)

// ValidAccountID reports whether s is a valid NEAR account id (2-64 chars, lowercase).
func ValidAccountID(s string) bool { return len(s) >= 2 && len(s) <= 64 && accountRe.MatchString(s) }
