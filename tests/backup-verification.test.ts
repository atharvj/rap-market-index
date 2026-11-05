import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("verifies encrypted streamed tables and rejects a tampered table even with a matching archive checksum", () => {
  const dir = mkdtempSync(join(tmpdir(), "rmi-backup-verify-"));
  const env = { ...process.env, BACKUP_ENCRYPTION_KEY: "test-only-backup-passphrase-long-enough" };
  const names = ["profiles","artists","price_history","transactions","watchlist","market_valuation_boundaries","product_analytics_events"];
  const tables = join(dir,"payload","tables"); mkdirSync(tables,{recursive:true});
  const manifest = { format:"rmi-application-backup",formatVersion:1,authUserCount:0,storageObjectCount:0,
    tableCounts:Object.fromEntries(names.map(n=>[n,0])),tableChecksums:Object.fromEntries(names.map(n=>[n,createHash("sha256").update("[]\n").digest("hex")])) };
  for(const name of names)writeFileSync(join(tables,name+".json"),"[]\n");
  writeFileSync(join(dir,"payload","manifest.json"),JSON.stringify(manifest));
  const archive=join(dir,"backup.enc");
  const encrypt=()=>{
    const tar=execFileSync("tar",["-C",dir,"-czf","-","payload"]);
    execFileSync("openssl",["enc","-aes-256-cbc","-salt","-pbkdf2","-iter","200000","-pass","env:BACKUP_ENCRYPTION_KEY","-out",archive],{env,input:tar});
    writeFileSync(archive+".sha256",createHash("sha256").update(readFileSync(archive)).digest("hex")+"\n");
  };
  try{
    encrypt();expect(execFileSync("bash",["scripts/verify-application-backup.sh",archive],{env,encoding:"utf8"})).toContain("are valid");
    writeFileSync(join(tables,"artists.json"),'[{"id":"tampered"}]');encrypt();
    expect(()=>execFileSync("bash",["scripts/verify-application-backup.sh",archive],{env,stdio:"pipe"})).toThrow();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
