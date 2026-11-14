//! NATS JetStream in/out.

pub mod streams;

use anyhow::{anyhow, Context as _, Result};
use async_nats::jetstream::{self, consumer::pull, message::PublishMessage, Context};
use bytes::Bytes;
use futures::StreamExt;

use crate::adapters::codec::OutMsg;

pub struct Bus {
    js: Context,
}

impl Bus {
    pub async fn connect(url: &str) -> Result<Self> {
        let client = async_nats::connect(url)
            .await
            .with_context(|| format!("connect {url}"))?;
        Ok(Self {
            js: jetstream::new(client),
        })
    }

    pub fn jetstream(&self) -> &Context {
        &self.js
    }

    // idempotent: existing streams left as is
    pub async fn ensure_streams(&self) -> Result<()> {
        for cfg in [streams::engine_in(), streams::engine_out()] {
            let name = cfg.name.clone();
            self.js
                .get_or_create_stream(cfg)
                .await
                .map_err(|e| anyhow!("ensure stream {name}: {e}"))?;
        }
        Ok(())
    }

    // recreate durable so delivery starts exactly at start_seq
    pub async fn inputs(&self, start_seq: u64) -> Result<Inputs> {
        let cfg = streams::consumer(start_seq);
        let name = cfg.durable_name.clone().expect("durable consumer");
        let stream = self
            .js
            .get_stream(streams::engine_in().name)
            .await
            .map_err(|e| anyhow!("get ENGINE_IN: {e}"))?;
        // not found is fine
        let _ = stream.delete_consumer(&name).await;
        let consumer: pull::Stream = stream
            .create_consumer(cfg)
            .await
            .map_err(|e| anyhow!("create consumer {name}: {e}"))?
            .messages()
            .await
            .map_err(|e| anyhow!("consume {name}: {e}"))?;
        Ok(Inputs { messages: consumer })
    }

    // publish all, then wait every puback
    pub async fn publish(&self, msgs: Vec<OutMsg>) -> Result<()> {
        let mut acks = Vec::with_capacity(msgs.len());
        for m in msgs {
            let publish = PublishMessage::build()
                .payload(Bytes::from(m.payload))
                .message_id(&m.msg_id);
            let ack = self
                .js
                .send_publish(m.subject, publish)
                .await
                .map_err(|e| anyhow!("publish {}: {e}", m.msg_id))?;
            acks.push(ack);
        }
        // already in flight; await in order
        for ack in acks {
            ack.await.map_err(|e| anyhow!("puback: {e}"))?;
        }
        Ok(())
    }
}

pub struct Inputs {
    messages: pull::Stream,
}

impl Inputs {
    pub async fn next(&mut self) -> Option<Result<InMsg>> {
        let msg = match self.messages.next().await? {
            Ok(msg) => msg,
            Err(e) => return Some(Err(anyhow!("consume: {e}"))),
        };
        Some(InMsg::new(msg))
    }
}

pub struct InMsg {
    pub seq: u64,
    pub subject: String,
    pub payload: Bytes,
    msg: jetstream::Message,
}

impl InMsg {
    fn new(msg: jetstream::Message) -> Result<Self> {
        let seq = msg
            .info()
            .map_err(|e| anyhow!("msg info: {e}"))?
            .stream_sequence;
        Ok(Self {
            seq,
            subject: msg.subject.to_string(),
            payload: msg.payload.clone(),
            msg,
        })
    }

    // double ack: server confirms, so no redelivery after return
    pub async fn ack(self) -> Result<()> {
        self.msg
            .double_ack()
            .await
            .map_err(|e| anyhow!("ack {}: {e}", self.seq))
    }
}
