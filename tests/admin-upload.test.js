'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {server}=require('../server');
const {fromUpload}=require('../zip-games');
const realFetch=global.fetch;
const OLD={ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,GITHUB_TOKEN:process.env.GITHUB_TOKEN,GITHUB_REPOSITORY:process.env.GITHUB_REPOSITORY};
function restoreEnv(){for(const [k,v] of Object.entries(OLD)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
test('Publication directe GitHub: mot de passe, archive, fiche, couverture et protections',async()=>{
 process.env.ADMIN_PASSWORD='password-test-local-secret';process.env.GITHUB_TOKEN='not-a-real-token';process.env.GITHUB_REPOSITORY='demo/portal';
 const githubWrites=[];
 const existing=new Set();
 global.fetch=async(input,options)=>{
  const url=String(input);
  if(url.startsWith('https://api.github.com/')){
   if((options?.method||'GET')==='GET')return new Response(existing.has(url.split('?')[0])?'{}':'{}',{status:existing.has(url.split('?')[0])?200:404,headers:{'Content-Type':'application/json'}});
   const payload=JSON.parse(options.body);githubWrites.push({url,payload});existing.add(url);
   return new Response(JSON.stringify({content:{path:url}}),{status:201,headers:{'Content-Type':'application/json'}});
  }
  return realFetch(input,options);
 };
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async body=>{const r=await realFetch(base+'/api/portal/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {code:r.status,data:await r.json()}};
 const body={name:'Une belle aventure',filename:'monjeu.html',base64:Buffer.from('<!doctype html><html><head><title>Test</title></head><body>Jouer</body></html>').toString('base64'),description:'Une aventure en solo',category:'Puzzle & réflexion',icon:'🧩',password:process.env.ADMIN_PASSWORD};
 try{
  const wrong=await post({...body,password:'wrong'});assert.equal(wrong.code,403);assert.equal(githubWrites.length,0);
  const reserved=await post({...body,name:'MARVEL FUSION'});assert.equal(reserved.code,409);assert.equal(githubWrites.length,0);
  const invalid=await post({...body,filename:'server.js'});assert.equal(invalid.code,400);
  const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489','hex');
  const done=await post({...body,coverName:'mon-image.png',coverBase64:png.toString('base64')});assert.equal(done.code,201,JSON.stringify(done));assert.equal(done.data.slug,'une-belle-aventure');
  assert.equal(githubWrites.length,1);
  assert.match(githubWrites[0].url,/uploads\/une-belle-aventure.zip$/);
  const uploaded=fromUpload('payload.zip',Buffer.from(githubWrites[0].payload.content,'base64'));
  assert.match(uploaded.get('index.html').toString(),/Jouer/);
  assert.equal(uploaded.get('_couverture_portail.png').toString('hex'),png.toString('hex'));
  const meta=JSON.parse(uploaded.get('_portail_jeu.json').toString());assert.equal(meta.title,body.name);assert.equal(meta.category,body.category);assert.equal(meta.icon,'🧩');assert.equal(meta.cover,'_couverture_portail.png');
  const duplicate=await post(body);assert.equal(duplicate.code,409);assert.equal(githubWrites.length,1);
  const badCover=await post({...body,name:'Another',coverName:'fake.png',coverBase64:Buffer.from('not really png').toString('base64')});assert.equal(badCover.code,400);
  const otherSite=await realFetch(base+'/api/portal/upload',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://attacker.example'},body:JSON.stringify(body)});assert.equal(otherSite.status,403);
 }finally{global.fetch=realFetch;restoreEnv();await new Promise(done=>server.close(done))}
});
