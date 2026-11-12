#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct MarketId(pub u32);

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OrderId(pub u64);

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TradeId(pub u64);

const ACCOUNT_MAX: usize = 64;

// near account id, inline so it stays Copy. zero-padded, len = used bytes
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AccountId {
    len: u8,
    buf: [u8; ACCOUNT_MAX],
}

impl AccountId {
    // near rules: 2..=64 chars of [a-z0-9], parts split by single . - _
    pub fn new(s: &str) -> Option<Self> {
        let b = s.as_bytes();
        let ok_len = (2..=ACCOUNT_MAX).contains(&b.len());
        let sep = |c: u8| matches!(c, b'.' | b'-' | b'_');
        let ok_chars = b.iter().all(|&c| c.is_ascii_lowercase() || c.is_ascii_digit() || sep(c));
        let ok_seps = !sep(b[0]) && !sep(b[b.len() - 1]) && !b.windows(2).any(|w| sep(w[0]) && sep(w[1]));
        if !(ok_len && ok_chars && ok_seps) {
            return None;
        }
        let mut buf = [0; ACCOUNT_MAX];
        buf[..b.len()].copy_from_slice(b);
        Some(Self { len: b.len() as u8, buf })
    }

    pub fn as_str(&self) -> &str {
        // only built from validated ascii in new()
        std::str::from_utf8(&self.buf[..self.len as usize]).unwrap()
    }
}

impl std::fmt::Debug for AccountId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "AccountId({})", self.as_str())
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for AccountId {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for AccountId {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        AccountId::new(&s).ok_or_else(|| serde::de::Error::custom(format!("bad account id {s:?}")))
    }
}

#[cfg(test)]
mod tests {
    use super::AccountId;

    #[test]
    fn account_id_rules() {
        for ok in ["alice.testnet", "a1", "x-y_z.near", &"a".repeat(64)] {
            assert_eq!(AccountId::new(ok).unwrap().as_str(), ok);
        }
        for bad in ["a", "Alice.near", ".a", "a.", "a..b", "a b", &"a".repeat(65)] {
            assert!(AccountId::new(bad).is_none(), "{bad}");
        }
    }
}
