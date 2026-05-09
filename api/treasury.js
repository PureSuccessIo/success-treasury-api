const ETHERSCAN_API_KEY=process.env.ETHERSCAN_API_KEY;

const CHAIN_ID="56";
const ETHERSCAN_V2_URL="https://api.etherscan.io/v2/api";

const WALLETS=[
  {
    source:"AsterDEX",
    category:"Trading Revenue",
    chain:"BSC",
    address:"0x4041c873cE0eB84F05De19d3Bd6c0E269b7a4aAD",
    short:"0x4041...4aAD",
    walletUrl:"https://bscscan.com/address/0x4041c873cE0eB84F05De19d3Bd6c0E269b7a4aAD",
    referralUrl:"#",
    status:"Active"
  },
  {
    source:"dYdX",
    category:"Trading Revenue",
    chain:"BSC",
    address:"0x5BD58fa2ff6396ACd1e898e26A4802748EB22E23",
    short:"0x5BD5...2E23",
    walletUrl:"https://bscscan.com/address/0x5BD58fa2ff6396ACd1e898e26A4802748EB22E23",
    referralUrl:"#",
    status:"Active"
  },
  {
    source:"Hyperliquid",
    category:"Trading Revenue",
    chain:"BSC",
    address:"0x931c468E158306562A29EBcfCeA2D8Bd9EdeE94b",
    short:"0x931c...E94b",
    walletUrl:"https://bscscan.com/address/0x931c468E158306562A29EBcfCeA2D8Bd9EdeE94b",
    referralUrl:"#",
    status:"Active"
  }
];

const TOKEN_CONTRACTS={
  USDT:"0x55d398326f99059fF775485246999027B3197955",
  USDC:"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
};

const TOKEN_DECIMALS={
  BNB:18,
  USDT:18,
  USDC:18
};

function json(res,status,data){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=240");
  res.status(status).json(data);
}

function toNumber(value,decimals){
  try{
    const raw=BigInt(value || "0");
    const base=10n**BigInt(decimals);
    const whole=raw/base;
    const fraction=raw%base;
    const fractionText=fraction.toString().padStart(decimals,"0").slice(0,8);
    return Number(`${whole.toString()}.${fractionText}`);
  }catch{
    return 0;
  }
}

function moneyNumber(value){
  const n=Number(value || 0);
  return Number(n.toFixed(2));
}

function isSameAddress(a,b){
  return String(a || "").toLowerCase()===String(b || "").toLowerCase();
}

async function etherscan(params){
  if(!ETHERSCAN_API_KEY){
    throw new Error("Missing ETHERSCAN_API_KEY environment variable");
  }

  const url=new URL(ETHERSCAN_V2_URL);
  url.searchParams.set("chainid",CHAIN_ID);

  Object.entries(params).forEach(([key,value])=>{
    url.searchParams.set(key,value);
  });

  url.searchParams.set("apikey",ETHERSCAN_API_KEY);

  const response=await fetch(url.toString());
  const data=await response.json();

  if(data.status==="0" && data.message!=="No transactions found"){
    throw new Error(data.result || data.message || "Etherscan API error");
  }

  return data.result;
}

async function getBnbPrice(){
  try{
    const response=await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT");
    const data=await response.json();
    const price=Number(data.price);
    return price>0 ? price : 600;
  }catch{
    return 600;
  }
}

async function getBnbBalance(address){
  const result=await etherscan({
    module:"account",
    action:"balance",
    address,
    tag:"latest"
  });

  return toNumber(result,18);
}

async function getTokenBalance(address,contractAddress){
  const result=await etherscan({
    module:"account",
    action:"tokenbalance",
    contractaddress:contractAddress,
    address,
    tag:"latest"
  });

  return toNumber(result,18);
}

async function getNormalTransactions(address){
  const result=await etherscan({
    module:"account",
    action:"txlist",
    address,
    startblock:"0",
    endblock:"99999999",
    page:"1",
    offset:"1000",
    sort:"asc"
  });

  return Array.isArray(result) ? result : [];
}

async function getTokenTransactions(address,contractAddress){
  const result=await etherscan({
    module:"account",
    action:"tokentx",
    contractaddress:contractAddress,
    address,
    startblock:"0",
    endblock:"99999999",
    page:"1",
    offset:"1000",
    sort:"asc"
  });

  return Array.isArray(result) ? result : [];
}

function classifyBnbTransactions(wallet,txs,bnbUsd){
  const incoming=[];
  const outgoing=[];

  txs.forEach(tx=>{
    const value=toNumber(tx.value,18);

    if(value<=0){
      return;
    }

    const usd=value*bnbUsd;

    const event={
      timestamp:Number(tx.timeStamp || 0)*1000,
      date:new Date(Number(tx.timeStamp || 0)*1000).toISOString(),
      source:wallet.source,
      category:wallet.category,
      chain:wallet.chain,
      wallet:wallet.short,
      token:"BNB",
      amount:value,
      amountUsd:moneyNumber(usd),
      txHash:tx.hash,
      txUrl:`https://bscscan.com/tx/${tx.hash}`
    };

    if(isSameAddress(tx.to,wallet.address)){
      incoming.push(event);
    }

    if(isSameAddress(tx.from,wallet.address)){
      outgoing.push(event);
    }
  });

  return {incoming,outgoing};
}

function classifyTokenTransactions(wallet,txs,symbol){
  const incoming=[];
  const outgoing=[];

  txs.forEach(tx=>{
    const value=toNumber(tx.value,TOKEN_DECIMALS[symbol]);

    if(value<=0){
      return;
    }

    const event={
      timestamp:Number(tx.timeStamp || 0)*1000,
      date:new Date(Number(tx.timeStamp || 0)*1000).toISOString(),
      source:wallet.source,
      category:wallet.category,
      chain:wallet.chain,
      wallet:wallet.short,
      token:symbol,
      amount:value,
      amountUsd:moneyNumber(value),
      txHash:tx.hash,
      txUrl:`https://bscscan.com/tx/${tx.hash}`
    };

    if(isSameAddress(tx.to,wallet.address)){
      incoming.push(event);
    }

    if(isSameAddress(tx.from,wallet.address)){
      outgoing.push(event);
    }
  });

  return {incoming,outgoing};
}

function sumUsd(events){
  return moneyNumber(events.reduce((sum,event)=>sum+Number(event.amountUsd || 0),0));
}

function uniqueEvents(events){
  const map=new Map();

  events.forEach(event=>{
    const key=`${event.txHash}-${event.token}-${event.source}-${event.amount}-${event.timestamp}`;
    map.set(key,event);
  });

  return Array.from(map.values()).sort((a,b)=>b.timestamp-a.timestamp);
}

export default async function handler(req,res){
  if(req.method==="OPTIONS"){
    return json(res,200,{ok:true});
  }

  if(req.method!=="GET"){
    return json(res,405,{error:"Method not allowed"});
  }

  try{
    const bnbUsd=await getBnbPrice();
    const walletResults=[];

    for(const wallet of WALLETS){
      const [
        bnbBalance,
        usdtBalance,
        usdcBalance,
        bnbTxs,
        usdtTxs,
        usdcTxs
      ]=await Promise.all([
        getBnbBalance(wallet.address),
        getTokenBalance(wallet.address,TOKEN_CONTRACTS.USDT),
        getTokenBalance(wallet.address,TOKEN_CONTRACTS.USDC),
        getNormalTransactions(wallet.address),
        getTokenTransactions(wallet.address,TOKEN_CONTRACTS.USDT),
        getTokenTransactions(wallet.address,TOKEN_CONTRACTS.USDC)
      ]);

      const bnbClassified=classifyBnbTransactions(wallet,bnbTxs,bnbUsd);
      const usdtClassified=classifyTokenTransactions(wallet,usdtTxs,"USDT");
      const usdcClassified=classifyTokenTransactions(wallet,usdcTxs,"USDC");

      const incoming=uniqueEvents([
        ...bnbClassified.incoming,
        ...usdtClassified.incoming,
        ...usdcClassified.incoming
      ]);

      const outgoing=uniqueEvents([
        ...bnbClassified.outgoing,
        ...usdtClassified.outgoing,
        ...usdcClassified.outgoing
      ]);

      const currentBalanceUsd=moneyNumber((bnbBalance*bnbUsd)+usdtBalance+usdcBalance);
      const revenueGenerated=sumUsd(incoming);
      const allocatedFunds=sumUsd(outgoing);

      walletResults.push({
        ...wallet,
        balances:{
          BNB:bnbBalance,
          USDT:usdtBalance,
          USDC:usdcBalance,
          usd:currentBalanceUsd
        },
        revenueGenerated,
        allocatedFunds,
        netUnallocated:moneyNumber(revenueGenerated-allocatedFunds),
        incoming,
        outgoing
      });
    }

    const allIncoming=uniqueEvents(walletResults.flatMap(wallet=>wallet.incoming));
    const allOutgoing=uniqueEvents(walletResults.flatMap(wallet=>wallet.outgoing));

    const totalRevenueGenerated=sumUsd(allIncoming);
    const totalAllocatedFunds=sumUsd(allOutgoing);
    const currentTreasuryBalance=moneyNumber(walletResults.reduce((sum,wallet)=>sum+wallet.balances.usd,0));

    const categories=[
      {
        icon:"📈",
        title:"Trading Revenue",
        description:"Revenue generated from active trading systems and market strategies.",
        totalRevenue:totalRevenueGenerated,
        currentBalance:currentTreasuryBalance,
        allocated:totalAllocatedFunds,
        sources:walletResults.map(wallet=>({
          name:wallet.source,
          wallet:wallet.short,
          walletUrl:wallet.walletUrl,
          referralUrl:wallet.referralUrl,
          chain:wallet.chain,
          revenue:wallet.revenueGenerated,
          balance:wallet.balances.usd,
          allocated:wallet.allocatedFunds,
          d30:wallet.revenueGenerated,
          status:wallet.status,
          balances:wallet.balances
        }))
      }
    ];

    return json(res,200,{
      ok:true,
      mode:"backend-history",
      chain:"BSC",
      bnbUsd,
      lastUpdated:new Date().toISOString(),
      overview:{
        totalRevenueGenerated,
        totalAllocatedFunds,
        currentTreasuryBalance,
        netUnallocated:moneyNumber(totalRevenueGenerated-totalAllocatedFunds)
      },
      categories,
      revenueEvents:allIncoming.slice(0,50),
      allocationEvents:allOutgoing.slice(0,50),
      wallets:walletResults.map(wallet=>({
        source:wallet.source,
        address:wallet.address,
        short:wallet.short,
        balances:wallet.balances,
        revenueGenerated:wallet.revenueGenerated,
        allocatedFunds:wallet.allocatedFunds,
        netUnallocated:wallet.netUnallocated
      }))
    });
  }catch(error){
    return json(res,500,{
      ok:false,
      error:error.message
    });
  }
}
