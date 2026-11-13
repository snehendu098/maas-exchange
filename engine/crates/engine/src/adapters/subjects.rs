//! Subject names. Market-scoped subjects end with market symbol.

pub const IN_ALL: &str = "engine.in.>";
pub const IN_CHAIN: &str = "engine.in.chain";
pub const IN_SETTLE: &str = "engine.in.settle";
const IN_PREFIX: &str = "engine.in.";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InKind {
    Order,
    Cancel,
    Chain,
    Settle,
}

impl InKind {
    pub fn parse(subject: &str) -> Option<Self> {
        let rest = subject.strip_prefix(IN_PREFIX)?;
        match rest.split('.').next()? {
            "order" => Some(Self::Order),
            "cancel" => Some(Self::Cancel),
            "chain" => Some(Self::Chain),
            "settle" => Some(Self::Settle),
            _ => None,
        }
    }
}

pub fn in_order(symbol: &str) -> String {
    format!("{IN_PREFIX}order.{symbol}")
}

pub fn in_cancel(symbol: &str) -> String {
    format!("{IN_PREFIX}cancel.{symbol}")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutKind {
    Fill,
    Book,
    Status,
}

impl OutKind {
    pub fn subject(self, symbol: &str) -> String {
        let kind = match self {
            Self::Fill => "fill",
            Self::Book => "book",
            Self::Status => "status",
        };
        format!("engine.out.{kind}.{symbol}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_in_subjects() {
        assert_eq!(InKind::parse(&in_order("BTC")), Some(InKind::Order));
        assert_eq!(InKind::parse(&in_cancel("ETH")), Some(InKind::Cancel));
        assert_eq!(InKind::parse(IN_CHAIN), Some(InKind::Chain));
        assert_eq!(InKind::parse(IN_SETTLE), Some(InKind::Settle));
        assert_eq!(InKind::parse("engine.in.nope"), None);
        assert_eq!(InKind::parse("engine.out.fill.BTC"), None);
        assert_eq!(OutKind::Fill.subject("BTC"), "engine.out.fill.BTC");
    }
}
