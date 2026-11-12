// pure-rust protoc (protox): no system protoc needed
const ROOT: &str = "../../../proto";
const FILES: [&str; 3] = [
    "perp/v1/order.proto",
    "perp/v1/engine.proto",
    "perp/v1/chain.proto",
];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let fds = protox::compile(FILES, [ROOT])?;
    prost_build::Config::new().compile_fds(fds)?;
    println!("cargo:rerun-if-changed={ROOT}/perp");
    Ok(())
}
