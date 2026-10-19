// Standalone Node script; no implicit dotenv loading or seed execution on import.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'company-seed-data.json'),'utf8'));
  const kinds=['info','cml','testPoints','thickness'];
  for(const k of kinds)if(!Array.isArray(data[k]))throw Error('Invalid private seed input');
  const counts=Object.fromEntries(kinds.map(k=>[k,data[k].length]));
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'input preview only; no database connection',counts}));return;}
  const {DATABASE_URL,SEED_EXPECTED_HOST,SEED_EXPECTED_PORT,SEED_EXPECTED_DATABASE,SEED_CONFIRM_DATABASE}=process.env;
  const u=new URL(DATABASE_URL);
  if(!['postgresql:','postgres:'].includes(u.protocol)||!SEED_EXPECTED_HOST||!SEED_EXPECTED_PORT||!SEED_EXPECTED_DATABASE||u.hostname!==SEED_EXPECTED_HOST||(u.port||'5432')!==SEED_EXPECTED_PORT||decodeURIComponent(u.pathname.slice(1))!==SEED_EXPECTED_DATABASE||SEED_CONFIRM_DATABASE!==SEED_EXPECTED_DATABASE||(['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&(u.port||'5432')==='5434'))throw Error('Seed target rejected');
  const {PrismaClient,Prisma}=require('@prisma/client');
  const dec=(v,p)=>{if(typeof v!=='string'||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v))throw Error('Seed decimal must be text');const d=new Prisma.Decimal(v);if(d.decimalPlaces()>3||d.abs().gte(new Prisma.Decimal(10).pow(p-3)))throw Error('Seed decimal storage overflow');return d;};
  const int=v=>{if(!Number.isInteger(v)||v < -2147483648||v > 2147483647)throw Error('Invalid seed integer');return v;};
  const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Invalid seed date');const d=new Date(v+'T00:00:00.000Z');if(d.toISOString().slice(0,10)!==v)throw Error('Invalid seed date');return d;};
  const text=v=>{if(typeof v!=='string'||!v.trim())throw Error('Missing seed text');return v;};
  const same=(a,b)=>b instanceof Prisma.Decimal?b.equals(a):b instanceof Date?a instanceof Date&&a.getTime()===b.getTime():a===b;
  const inserted=Object.fromEntries(kinds.map(k=>[k,0])),existing={...inserted};
  const prisma=new PrismaClient();
  try{
    await prisma.$transaction(async tx=>{
      const identity=await tx.$queryRaw`SELECT current_database() AS database, current_schema() AS schema`;
      if(identity[0]?.database!==SEED_EXPECTED_DATABASE||identity[0]?.schema!=='public')throw Error('Seed identity rejected');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(6101901)::text`;
      async function preserve(model,where,values,kind){
        const row=await tx[model].findUnique({where});
        if(row){if(!Object.entries(values).every(([k,v])=>same(row[k],v)))throw Error('SEED_CONFLICT: '+kind+' differs; existing data not overwritten');existing[kind]++;return row;}
        const created=await tx[model].create({data:values});inserted[kind]++;return created;
      }
      const infos=new Map(),cmls=new Map(),points=new Map();
      for(const r of data.info){
        const lineNumber=text(r.line_number);if(infos.has(lineNumber))throw Error('Duplicate seed line');
        const v={lineNumber,location:text(r.location),fromLocation:text(r.from),toLocation:text(r.to),drawingNumber:text(r['drawing number']),service:text(r.service),material:text(r.material),inserviceDate:date(r.inservice_date),pipeSize:dec(r.pipe_size,6),originalThickness:dec(r.original_thickness,8),stress:int(r.stress),jointEfficiency:int(r.joint_efficiency),ca:int(r.ca),designLife:int(r.design_life),designPressure:int(r.design_pressure),operatingPressure:int(r.operating_pressure),designTemperature:int(r.design_temperature),operatingTemperature:dec(r.operating_temperature,13)};
        infos.set(lineNumber,(await preserve('info',{lineNumber},v,'info')).id);
      }
      for(const r of data.cml){
        const infoId=infos.get(r.line_number);if(!infoId)throw Error('Missing seed CML parent');const key=JSON.stringify([r.line_number,r.cml_number]);if(cmls.has(key))throw Error('Duplicate seed CML');
        if(!(await tx.$queryRaw`SELECT id FROM info WHERE id=${infoId} FOR KEY SHARE`).length)throw Error('Seed parent disappeared');
        const v={infoId,cmlNumber:int(r.cml_number),cmlDescription:text(r.cml_description)};
        for(const [a,b]of[['actualOutsideDiameter','actual_outside_diameter'],['designThickness','design_ thickness'],['structuralThickness','structural_ thickness'],['requiredThickness','required_ thickness']])v[a]=r[b]==null?null:dec(r[b],8);
        cmls.set(key,(await preserve('cml',{infoId_cmlNumber:{infoId,cmlNumber:v.cmlNumber}},v,'cml')).id);
      }
      for(const r of data.testPoints){
        const cmlId=cmls.get(JSON.stringify([r.line_number,r.cml_number]));if(!cmlId)throw Error('Missing seed TP parent');const key=JSON.stringify([r.line_number,r.cml_number,r.tp_number]);if(points.has(key))throw Error('Duplicate seed TP');
        if(!(await tx.$queryRaw`SELECT id FROM cml WHERE id=${cmlId} FOR KEY SHARE`).length)throw Error('Seed parent disappeared');
        const v={cmlId,tpNumber:int(r.tp_number),tpDescription:int(r.tp_description),note:r.note==null?null:r.note};if(v.note!==null&&typeof v.note!=='string')throw Error('Invalid seed note');
        points.set(key,(await preserve('testPoint',{cmlId_tpNumber:{cmlId,tpNumber:v.tpNumber}},v,'testPoints')).id);
      }
      const measurements=new Set();
      for(const r of data.thickness){
        const testPointId=points.get(JSON.stringify([r.line_number,r.cml_number,r.tp_number]));if(!testPointId)throw Error('Missing seed Thickness parent');const key=JSON.stringify([testPointId,r.inspection_date]);if(measurements.has(key))throw Error('Duplicate seed inspection');measurements.add(key);
        if(!(await tx.$queryRaw`SELECT id FROM test_point WHERE id=${testPointId} FOR KEY SHARE`).length)throw Error('Seed parent disappeared');
        const v={testPointId,inspectionDate:date(r.inspection_date),actualThickness:dec(r.actual_thickness,8)};
        await preserve('thickness',{testPointId_inspectionDate:{testPointId,inspectionDate:v.inspectionDate}},v,'thickness');
      }
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000,maxWait:10000});
    console.log(JSON.stringify({counts,inserted,existing,overwritten:0}));
  }finally{await prisma.$disconnect();}
}
if(require.main===module)main().catch(e=>{console.error(e.message?.startsWith('SEED_CONFLICT:')?e.message:'Seed failed; transaction not committed. Check target, private input and schema.');process.exitCode=1;});
module.exports={main};
