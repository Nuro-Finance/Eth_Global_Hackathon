import re

with open('/home/nuro/Nuro-Finance/src/bridge.ts', 'r') as f:
    src = f.read()

OLD = """    // Circle auto-relays standard transfers - no need to call receiveMessage
    console.log(`[cctp] Circle auto-relay will mint on Base. Burn tx: ${burnTx.hash}`)
    return burnTx.hash"""

NEW = """    // Call receiveMessage on Base MessageTransmitter to complete the mint
    console.log(`[cctp] Attestation received — submitting receiveMessage on Base...`)
    const burnReceipt = await provider.getTransactionReceipt(burnTx.hash)
    const MSG_SENT_TOPIC = "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036"
    const msgLog = burnReceipt.logs.find((l: any) => l.topics[0] === MSG_SENT_TOPIC)
    if (!msgLog) throw new Error("MessageSent log not found in burn receipt")
    const messageBytes = ethers.utils.defaultAbiCoder.decode(["bytes"], msgLog.data)[0]
    const baseRelayProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_BASE || "https://mainnet.base.org")
    const relayWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, baseRelayProvider)
    const baseMsgTransmitter = new ethers.Contract(
        MESSAGE_TRANSMITTER_V2,
        ["function receiveMessage(bytes calldata message, bytes calldata attestation) returns (bool success)"],
        relayWallet
    )
    const mintTx = await baseMsgTransmitter.receiveMessage(messageBytes, attestation, { gasLimit: 400000 })
    await mintTx.wait()
    console.log(`[cctp] Mint confirmed on Base: ${mintTx.hash}`)
    return burnTx.hash"""

if OLD in src:
    patched = src.replace(OLD, NEW)
    with open('/home/nuro/Nuro-Finance/src/bridge.ts', 'w') as f:
        f.write(patched)
    print("✅ bridge.ts patched successfully")
else:
    print("❌ Target string NOT found — check whitespace/quotes")
    # Show nearby lines for debugging
    idx = src.find("auto-relay")
    if idx >= 0:
        print("Found 'auto-relay' at char", idx)
        print(repr(src[idx-100:idx+200]))
