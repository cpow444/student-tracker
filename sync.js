import { createClient } from '@supabase/supabase-js';

const response = (res, code, data) => {res.setHeader('Cache-Control','no-store');return res.status(code).json(data)};
function icsUnfold(text) { return text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').replace(/\r/g,''); }
function prop(block, key) {
  const line = block.split('\n').find(x => x.startsWith(key+':') || x.startsWith(key+';'));
  return line ? line.slice(line.indexOf(':')+1) : '';
}
function unescapeIcs(s) { return String(s||'').replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\'); }
function validDate(s) {
  const m=String(s||'').match(/^(\d{4})(\d{2})(\d{2})/);
  if(!m) return null;
  const y=+m[1],month=+m[2],day=+m[3];
  const d=new Date(Date.UTC(y,month-1,day));
  if(d.getUTCFullYear()!==y||d.getUTCMonth()!==month-1||d.getUTCDate()!==day) return null;
  // All-day task deadlines are stored at noon UTC to avoid date changes on U.S. devices.
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00Z`;
}
function courseGuess(text) {
 const s=text.toLowerCase();
 if(/organic chemistry|\bchem\s?21[12]\b|\borgo\b/.test(s)) return 'Organic Chemistry I';
 if(/anatomy|\bbiol\s?12\d\b|a&p/.test(s)) return 'Anatomy & Physiology';
 if(/exercise physiology|\bbiol\s?413\b|exphys/.test(s)) return 'Exercise Physiology';
 if(/internship|strength.*conditioning/.test(s)) return 'Strength & Conditioning Internship';
 return 'Other / Check Class';
}
function parseFeed(content) {
 if(!content.includes('BEGIN:VCALENDAR')) throw new Error('The Canvas URL did not return an ICS calendar.');
 const events=[];
 for(const block of icsUnfold(content).split('BEGIN:VEVENT').slice(1)) {
  const title=unescapeIcs(prop(block,'SUMMARY')).trim();
  const uid=prop(block,'UID').trim();
  const date=validDate(prop(block,'DTSTART') || prop(block,'DUE'));
  if(!uid||!title||!date) continue;
  const description=unescapeIcs(prop(block,'DESCRIPTION'));
  const location=unescapeIcs(prop(block,'LOCATION'));
  const url=prop(block,'URL');
  events.push({canvas_uid:uid,title,course:courseGuess([title,description,location].join(' ')),due_date:date,description:description.slice(0,4000),canvas_url:url||null,source:'canvas'});
 }
 return events;
}
export default async function handler(req,res) {
 if(!['GET','POST'].includes(req.method)) return response(res,405,{error:'Method not allowed'});
 const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, CANVAS_ICS_URL, SYNC_OWNER_USER_ID, CRON_SECRET }=process.env;
 if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY||!SUPABASE_SECRET_KEY||!CANVAS_ICS_URL||!SYNC_OWNER_USER_ID)
  return response(res,503,{error:'Auto-sync is not configured yet. Add server secrets, Canvas URL and account ID in Vercel.'});
 if(!/^https:\/\/canvas\.umw\.edu\/feeds\/calendars\//.test(CANVAS_ICS_URL))
  return response(res,503,{error:'Canvas URL must be an HTTPS UMW calendar feed.'});
 const auth = req.headers.authorization||'';
 const isCron=Boolean(CRON_SECRET) && auth===`Bearer ${CRON_SECRET}`;
 if(!isCron) {
   const jwt=auth.match(/^Bearer\s+(.+)$/i)?.[1];
   if(!jwt) return response(res,401,{error:'Sign in to sync Canvas.'});
   const userClient=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:{user},error}=await userClient.auth.getUser(jwt);
   if(error||!user||user.id!==SYNC_OWNER_USER_ID) return response(res,403,{error:'Only the tracker owner can sync this feed.'});
 }
 try {
   const r=await fetch(CANVAS_ICS_URL,{headers:{'Accept':'text/calendar'},redirect:'follow',signal:AbortSignal.timeout(12000)});
   if(!r.ok) throw new Error(`Canvas returned HTTP ${r.status}`);
   const raw=await r.text();
   if(raw.length>5_000_000) throw new Error('Calendar feed exceeds size limit');
   const events=parseFeed(raw);
   const service=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:existing,error:readError}=await service.from('assignments').select('id,canvas_uid').eq('user_id',SYNC_OWNER_USER_ID).eq('source','canvas');
   if(readError) throw readError;
   const index=new Map((existing||[]).map(x=>[x.canvas_uid,x.id]));
   let added=0,updated=0;
   for(const e of events) {
      if(index.has(e.canvas_uid)) {
        // Do not overwrite completion or the user's priority/notes.
        const {error}=await service.from('assignments').update({title:e.title,due_date:e.due_date,description:e.description,canvas_url:e.canvas_url,updated_at:new Date().toISOString()}).eq('id',index.get(e.canvas_uid)).eq('user_id',SYNC_OWNER_USER_ID);
        if(error) throw error; updated++;
      } else {
        const {error}=await service.from('assignments').insert({user_id:SYNC_OWNER_USER_ID,...e});
        if(error) throw error; added++;
      }
   }
   return response(res,200,{ok:true,added,updated,calendarEvents:events.length,checkedAt:new Date().toISOString()});
 } catch(e) {console.error('Canvas sync failed:',e); return response(res,502,{error:'Canvas synchronization failed. Check Vercel function logs and private feed settings.'});}
}
