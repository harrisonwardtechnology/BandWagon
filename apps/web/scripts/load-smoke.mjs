import {performance} from "node:perf_hooks";

const baseUrl=String(process.env.LOAD_BASE_URL||"http://127.0.0.1:3000").replace(/\/$/,"");
const total=Math.max(20,Math.min(5000,Number(process.env.LOAD_REQUESTS||300)));
const concurrency=Math.max(1,Math.min(100,Number(process.env.LOAD_CONCURRENCY||20)));
const p95Limit=Math.max(100,Number(process.env.LOAD_P95_LIMIT_MS||1000));
const errorRateLimit=Math.max(0,Math.min(1,Number(process.env.LOAD_ERROR_RATE_LIMIT||0.01)));
const paths=["/","/api/health/live"];
const durations=[];let attempted=0,failed=0;

async function one(index){
  const started=performance.now();
  try{const response=await fetch(`${baseUrl}${paths[index%paths.length]}`,{cache:"no-store",signal:AbortSignal.timeout(5000)});if(!response.ok)failed+=1;await response.arrayBuffer();}
  catch{failed+=1;}
  durations.push(performance.now()-started);
}

for(let i=0;i<10;i+=1)await one(i);
durations.length=0;failed=0;
async function worker(){while(true){const index=attempted;attempted+=1;if(index>=total)return;await one(index);}}
const wallStarted=performance.now();
await Promise.all(Array.from({length:concurrency},()=>worker()));
const wallMs=performance.now()-wallStarted;
durations.sort((a,b)=>a-b);
const percentile=(value)=>durations[Math.min(durations.length-1,Math.ceil(durations.length*value)-1)]||0;
const errorRate=failed/total;
const result={requests:total,concurrency,failed,errorRate:Number(errorRate.toFixed(4)),requestsPerSecond:Number((total/(wallMs/1000)).toFixed(1)),p50Ms:Number(percentile(.5).toFixed(1)),p95Ms:Number(percentile(.95).toFixed(1)),p99Ms:Number(percentile(.99).toFixed(1))};
console.log(JSON.stringify(result));
if(errorRate>errorRateLimit)throw new Error(`Load smoke error rate ${errorRate} exceeds ${errorRateLimit}`);
if(result.p95Ms>p95Limit)throw new Error(`Load smoke p95 ${result.p95Ms} ms exceeds ${p95Limit} ms`);
