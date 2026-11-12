// Package migrations embeds the ordered *.sql schema files.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
