const fs=require('fs'), vm=require('vm'), path=require('path');
const root=process.argv[2]; const out={}; const dup=[];
for (const fac of ['face','fadi','faen','fain','faju','faru','fasa']) {
  const f=path.join(root,fac,'careers-data.js'); if(!fs.existsSync(f)) continue;
  const ctx={}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(f,'utf8')+';this.__C=CAREERS;',ctx);
  for (const c of Object.values(ctx.__C)) { if(out[c.planCode]) dup.push([c.planCode,out[c.planCode].facultad,fac]); out[c.planCode]={facultad:fac,carrera:c.id}; }
}
console.log(JSON.stringify({n:Object.keys(out).length, dup, sample:out['13121']}));
fs.writeFileSync(process.argv[3], JSON.stringify(out));
