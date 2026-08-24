import crypto from "node:crypto";
import pg from "pg";

const {Client}=pg;
const required=(name)=>{const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value;};
const activeSecret=required("DATA_ENCRYPTION_KEY");
const previousSecrets=String(required("DATA_ENCRYPTION_KEY_PREVIOUS")).split(",").map(value=>value.trim()).filter(Boolean);
required("LOOKUP_HASH_KEY");
if(previousSecrets.includes(activeSecret))throw new Error("Active and previous data keys must be different");
if(activeSecret.length<32||previousSecrets.some(value=>value.length<32))throw new Error("Data encryption keys must be at least 32 characters");
const dryRun=process.argv.includes("--dry-run");
if(!dryRun&&process.env.ROTATION_CONFIRM!=="ROTATE DATA ENCRYPTION")throw new Error("Set ROTATION_CONFIRM=\"ROTATE DATA ENCRYPTION\" to apply rotation");

const derive=(value)=>crypto.createHash("sha256").update(value).digest();
const activeKey=derive(activeSecret);
const keys=[activeKey,...previousSecrets.map(derive)];
function decrypt(value,allowedKeys=keys){
  const [ivPart,tagPart,encryptedPart]=String(value).split(".");
  if(!ivPart||!tagPart||!encryptedPart)throw new Error("Invalid encrypted value");
  for(const key of allowedKeys){try{const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(ivPart,"base64url"));decipher.setAuthTag(Buffer.from(tagPart,"base64url"));return Buffer.concat([decipher.update(Buffer.from(encryptedPart,"base64url")),decipher.final()]).toString("utf8");}catch{}}
  throw new Error("Encrypted value cannot be opened by the active or previous key");
}
function encrypt(value){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv("aes-256-gcm",activeKey,iv);const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return[iv,cipher.getAuthTag(),encrypted].map(part=>part.toString("base64url")).join(".");}

const targets=[
  {table:"phones",columns:["e164_ciphertext"]},
  {table:"google_connections",columns:["refresh_token_encrypted","access_token_encrypted"]},
  {table:"microsoft_connections",columns:["refresh_token_encrypted","access_token_encrypted"]},
  {table:"private_locations",columns:["address_ciphertext","latitude_ciphertext","longitude_ciphertext"]},
  {table:"auth_otp_challenges",columns:["destination_ciphertext"]},
  {table:"safety_alerts",columns:["latitude_ciphertext","longitude_ciphertext"]},
  {table:"event_intake_drafts",columns:["source_text_ciphertext"]},
];

const client=new Client({connectionString:required("DATABASE_URL"),ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:false}:undefined});
const counts={};
await client.connect();
try{
  await client.query("begin");
  for(const target of targets){
    const rows=(await client.query(`select id,${target.columns.join(",")} from ${target.table} for update`)).rows;
    let rotated=0;
    for(const row of rows){
      const updates=[];const values=[];
      for(const column of target.columns){
        const stored=row[column];
        if(stored==null||stored==="deleted")continue;
        const plaintext=decrypt(stored);
        const ciphertext=encrypt(plaintext);
        decrypt(ciphertext,[activeKey]);
        values.push(ciphertext);updates.push(`${column}=$${values.length}`);
      }
      if(updates.length){values.push(row.id);await client.query(`update ${target.table} set ${updates.join(",")} where id=$${values.length}`,values);rotated+=1;}
    }
    counts[target.table]=rotated;
  }
  if(!dryRun){
    await client.query(
      `insert into platform_health_heartbeats(component_key,component_type,status,last_started_at,last_succeeded_at,consecutive_failures,metadata,updated_at)
       values('data-key-rotation','service','healthy',now(),now(),0,$1::jsonb,now())
       on conflict(component_key) do update set status='healthy',last_started_at=now(),last_succeeded_at=now(),consecutive_failures=0,last_error=null,metadata=excluded.metadata,updated_at=now()`,
      [JSON.stringify({completedAt:new Date().toISOString(),rotatedRows:counts})]
    );
    await client.query("commit");
  }else await client.query("rollback");
  console.log(JSON.stringify({ok:true,dryRun,rotatedRows:counts}));
}catch(error){await client.query("rollback").catch(()=>{});throw error;}finally{await client.end();}
