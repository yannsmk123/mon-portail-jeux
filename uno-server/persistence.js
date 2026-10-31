'use strict';
// Persistance facultative des salons sur PostgreSQL de Render.
// Le serveur reste autoritaire : aucune main d'un adversaire n'est envoye au client.
function makeStore(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  const {Pool} = require('pg');
  const pool = new Pool({connectionString, max: 3, ssl: process.env.PGSSL === 'require' ? {rejectUnauthorized: false} : undefined});
  const queues = new Map();
  async function init() {
    await pool.query('CREATE TABLE IF NOT EXISTS uno_party_rooms (code VARCHAR(6) PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  }
  function serialize(room) {
    return {code:room.code,players:room.players.map(p=>({id:p.id,token:p.token,name:p.name,avatar:p.avatar,isBot:p.isBot,hand:p.hand,unoDeclared:p.unoDeclared})),hostId:room.hostId,botCount:room.botCount,status:room.status,game:room.game,lastActive:room.lastActive};
  }
  function chain(code, work) {
    const next = (queues.get(code) || Promise.resolve()).catch(()=>{}).then(work);
    queues.set(code,next);
    next.finally(()=>{if(queues.get(code)===next)queues.delete(code);}).catch(err=>console.error('[UNO] Erreur PostgreSQL:',err.message));
    return next;
  }
  function save(room) {
    const data = serialize(room);
    return chain(room.code,()=>pool.query('INSERT INTO uno_party_rooms(code,state,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()', [room.code,JSON.stringify(data)]));
  }
  function remove(code) { return chain(code,()=>pool.query('DELETE FROM uno_party_rooms WHERE code=$1',[code])); }
  async function load() {
    const {rows} = await pool.query('SELECT state FROM uno_party_rooms WHERE updated_at >= NOW() - INTERVAL \'2 hours\'');
    return rows.map(row=>row.state);
  }
  async function close() { await Promise.allSettled([...queues.values()]);await pool.end(); }
  return {init,save,remove,load,close};
}
module.exports={makeStore};
