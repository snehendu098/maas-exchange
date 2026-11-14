package vaultkeeper

import (
	"context"
	"testing"
)

func ps(rates ...string) []Print {
	out := make([]Print, len(rates))
	for i, r := range rates {
		out[i] = Print{Ref: "b:" + r, Rate: r}
	}
	return out
}

func TestDecide(t *testing.T) {
	for _, c := range []struct {
		name string
		mode Mode
		in   []Print
		want Mode
	}{
		{"no prints holds", ModeHedged, nil, ModeHedged},
		{"3h all negative exits", ModeHedged, ps("-1", "-5", "-2"), ModeFlat},
		{"one zero stays hedged", ModeHedged, ps("-1", "0", "-2"), ModeHedged},
		{"one positive stays hedged", ModeHedged, ps("-1", "3", "-2"), ModeHedged},
		{"flat re-enters on latest positive", ModeFlat, ps("-1", "-1", "2"), ModeHedged},
		{"flat stays on latest zero", ModeFlat, ps("5", "0"), ModeFlat},
		{"flat stays on latest negative", ModeFlat, ps("5", "-1"), ModeFlat},
		{"garbage never moves", ModeHedged, ps("x"), ModeHedged},
	} {
		if got := Decide(c.mode, c.in); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

type modeVault struct {
	modes map[uint32]Mode
	set   []string
}

func (v *modeVault) State(context.Context) (VaultState, error) {
	return VaultState{Modes: v.modes}, nil
}
func (v *modeVault) SetMode(_ context.Context, m uint32, to Mode, ref string) error {
	v.modes[m] = to
	v.set = append(v.set, to.String()+"@"+ref)
	return nil
}

func TestRebalancerCheck(t *testing.T) {
	v := &modeVault{modes: map[uint32]Mode{0: ModeHedged, 1: ModeHedged, 2: ModeFlat}}
	win := map[uint32][]Print{0: ps("-1", "-1", "-1"), 1: ps("-1", "1"), 2: ps("-1", "4")}
	r := Rebalancer{Vault: v, Prints: func(_ context.Context, m uint32) ([]Print, error) { return win[m], nil }}
	if err := r.Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if v.modes[0] != ModeFlat || v.modes[1] != ModeHedged || v.modes[2] != ModeHedged {
		t.Fatalf("modes %v", v.modes)
	}
	if len(v.set) != 2 || v.set[0] != "FLAT@b:-1" || v.set[1] != "HEDGED@b:4" {
		t.Fatalf("calls %v", v.set)
	}
}
