package logger

import (
	"log/slog"
	"os"
)

// New returns a JSON logger tagged with service; LOG_LEVEL=debug for verbose.
func New(service string) *slog.Logger {
	lvl := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		lvl = slog.LevelDebug
	}
	h := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: lvl})
	return slog.New(h).With("service", service)
}
