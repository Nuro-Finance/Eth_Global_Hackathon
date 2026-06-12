const {ethers}=require("ethers");
const A="0xd58C1412e50fF00212770B170D86e2387D2d2b18";
const B="0xA150EC8B718C22E12036f916d90FF72af14B3E96";
const C="0xce4c2270890267aC860fdc72b6946359d0898675";
const SRC=[
  {n:"zkSync", e:30165,a:B,r:"https://mainnet.era.zksync.io"},
  {n:"Scroll", e:30214,a:B,r:"https://rpc.scroll.io"},
  {n:"Celo",   e:30125,a:B,r:"https://forno.celo.org"},
  {n:"Gnosis", e:30145,a:B,r:"https://rpc.gnosischain.com"},
  {n:"BSC",    e:30102,a:C,r:"https://bsc-dataseed.binance.org"},
];
const ARPC="https://arb1.arbitrum.io/rpc",AEID=30110;
const ABI=["function peers(uint32) view returns (bytes32)","function setPeer(uint32,bytes32) external","function owner() view returns (address)"];
const Z="0x"+"0".repeat(64);
const b32=x=>"0x"+"0".repeat(24)+x.slice(2).toLowerCase();

async function checkPeer(contract,eid,expectedAddr){
  const cur=await contract.peers(eid).catch(()=>Z);
  return cur.toLowerCase()===b32(expectedAddr);
}

async function main(){
  const missing=[];
  console.log("\n=== PEER AUDIT ===");
  for(const s of SRC){
    const p=new ethers.providers.JsonRpcProvider(s.r);
    const c=new ethers.Contract(s.a,ABI,p);
    const ok=await checkPeer(c,AEID,A);
    console.log(" "+(ok?"[OK]  ":"[MISS]")+" "+s.n+" adapter -> Arbitrum peers("+AEID+")");
    if(!ok)missing.push({label:s.n+"->Arb",rpc:s.r,addr:s.a,toEid:AEID,toAddr:A});
  }
  const ap=new ethers.providers.JsonRpcProvider(ARPC);
  const ac=new ethers.Contract(A,ABI,ap);
  for(const s of SRC){
    const ok=await checkPeer(ac,s.e,s.a);
    console.log(" "+(ok?"[OK]  ":"[MISS]")+" Arbitrum adapter -> "+s.n+" peers("+s.e+")");
    if(!ok)missing.push({label:"Arb->"+s.n,rpc:ARPC,addr:A,toEid:s.e,toAddr:s.a});
  }
  console.log("\n "+missing.length+"/10 peers missing");
  if(!process.argv.includes("--deploy")){
    if(missing.length)console.log(" Run: PRIVATE_KEY=0x... node lz-peers.js --deploy");
    else console.log(" Nothing to do!");
    return;
  }
  if(!missing.length){console.log(" All peers already set!\n");return;}
  const pk=process.env.PRIVATE_KEY;
  if(!pk){console.error("\nERROR: PRIVATE_KEY env var not set\n");process.exit(1);}
  const groups={};
  for(const m of missing){
    const k=m.addr+"|"+m.rpc;
    if(!groups[k])groups[k]={rpc:m.rpc,addr:m.addr,items:[]};
    groups[k].items.push(m);
  }
  console.log("\n=== DEPLOYING ===");
  for(const {rpc,addr,items} of Object.values(groups)){
    const prov=new ethers.providers.JsonRpcProvider(rpc);
    const wallet=new ethers.Wallet(pk,prov);
    const contract=new ethers.Contract(addr,ABI, wallet);
    const owner=await contract.owner().catch(()=>"?");
    if(owner.toLowerCase()!==wallet.address.toLowerCase()){console.error(" SKIP "+addr+": owner="+owner);continue;}
    for(const m of items){
      const peerB32=b32(m.toAddr);
      console.log("\n setPeer("+m.toEid+") on "+m.label);
      try{
        const fd=await prov.getFeeData();
        const ov={gasLimit:200000};
        if(fd.maxFeePerGas){ov.maxFeePerGas=fd.maxFeePerGas;o