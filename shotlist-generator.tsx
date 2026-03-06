import { useState, useRef } from "react";

const LENTI = ["8mm","14mm","18mm","24mm","28mm","35mm","40mm","50mm","55mm","70mm","85mm","100mm","135mm","200mm","Macro","Zoom 24-70mm","Zoom 70-200mm","Anamorfico 40mm","Anamorfico 50mm","Anamorfico 85mm"];
const TIPI = ["CLL – Campo Lunghissimo","CL – Campo Lungo","CM – Campo Medio","FI – Figura Intera","PA – Piano Americano","MF – Mezza Figura","PP – Primo Piano","PPP – Primissimo Piano","Particolare","Dettaglio","Piano Sequenza"];
const MOVIMENTI = ["Statica","PAN destra","PAN sinistra","TILT su","TILT giù","Dolly avanti","Dolly indietro","Carrellata destra","Carrellata sinistra","Steadicam","Hand-held","Gru (Crane)","Drone/Aereo","Zoom in","Zoom out","Soggettiva (POV)","Low Angle","High Angle","Dutch Angle","360°"];
const DIFF = [{v:"facile",l:"Facile",c:"#22c55e",t:20},{v:"media",l:"Media",c:"#f59e0b",t:45},{v:"difficile",l:"Difficile",c:"#ef4444",t:90},{v:"estrema",l:"Molto Dif.",c:"#a855f7",t:150}];
const SETUP_MIN=45,LENS_MIN=5,DAY_MIN=600;
const fmtTime=m=>{const h=Math.floor(m/60),mn=m%60;return h?`${h}h${mn>0?' '+mn+'m':''}`:`${mn}m`;};

const calcTimes=scenes=>{
  let total=0,prevLente=null,prevLoc=null;
  const sceneData=scenes.map(sc=>{
    let t=0;
    if(prevLoc!==null&&sc.location&&sc.location!==prevLoc) t+=SETUP_MIN;
    prevLoc=sc.location;
    sc.shots.forEach((sh,i)=>{
      if(i>0&&sh.lente&&prevLente&&sh.lente!==prevLente) t+=LENS_MIN;
      t+=(DIFF.find(x=>x.v===sh.difficolta)||{t:30}).t;
      if(sh.lente) prevLente=sh.lente;
    });
    total+=t;
    return{id:sc.id,numero:sc.numero,location:sc.location,time:t};
  });
  return{total,sceneData,days:Math.ceil(total/DAY_MIN)};
};

const emptyShot=(n,i)=>({id:Math.random().toString(36).slice(2),shot:`${n}${String.fromCharCode(64+i)}`,pagina:"",personaggi:"",tipo:"",descrizione:"",movimento:"",lente:"",durata:"",difficolta:"media",note:"",riassunto:""});
const emptyScene=n=>({id:Math.random().toString(36).slice(2),numero:String(n),location:"",ambientazione:"INT",momento:"GIORNO",riassunto:"",collapsed:false,shots:[emptyShot(n,1)]});

const iStyle=(extra={})=>({background:"transparent",border:"none",color:"#e2e2f0",fontSize:10,padding:"3px 0",outline:"none",width:"100%",...extra});
const selStyle=color=>({background:"#0f0f1e",border:"1px solid rgba(255,255,255,0.08)",color:color||"#e2e2f0",padding:"4px 6px",borderRadius:5,fontSize:10,cursor:"pointer",width:"100%"});

const apiCall=async(messages,maxTokens=1000)=>{
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,messages})
  });
  if(!res.ok){const e=await res.text();throw new Error(`API error ${res.status}: ${e}`);}
  const d=await res.json();
  if(d.error) throw new Error(d.error.message||"API error");
  return d.content.filter(b=>b.type==="text").map(b=>b.text).join("");
};

const extractJSON=text=>{
  // Try direct parse first
  try{return JSON.parse(text.trim());}catch(e){}
  // Try extracting from code block
  const m=text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(m){try{return JSON.parse(m[1].trim());}catch(e){}}
  // Try finding first [ ... ]
  const start=text.indexOf("["),end=text.lastIndexOf("]");
  if(start!==-1&&end!==-1){try{return JSON.parse(text.slice(start,end+1));}catch(e){}}
  throw new Error("Impossibile estrarre JSON dalla risposta");
};

export default function App(){
  const [scenes,setScenes]=useState([emptyScene(1)]);
  const [titolo,setTitolo]=useState(""); const [regista,setRegista]=useState("");
  const [versione,setVersione]=useState("v1.0"); const [dataP,setDataP]=useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]=useState(false); const [status,setStatus]=useState("");
  const [statusType,setStatusType]=useState("info");
  const [showTime,setShowTime]=useState(false);
  const [fTxt,setFTxt]=useState(""); const [fDiff,setFDiff]=useState(""); const [fAmb,setFAmb]=useState(""); const [fMom,setFMom]=useState("");
  const [aiLoad,setAiLoad]=useState({});
  const fileRef=useRef();

  const setMsg=(msg,type="info")=>{setStatus(msg);setStatusType(type);};

  const updS=(id,k,v)=>setScenes(s=>s.map(sc=>sc.id===id?{...sc,[k]:v}:sc));
  const updSh=(sid,shid,k,v)=>setScenes(s=>s.map(sc=>sc.id===sid?{...sc,shots:sc.shots.map(sh=>sh.id===shid?{...sh,[k]:v}:sh)}:sc));
  const addShot=sid=>setScenes(s=>s.map(sc=>sc.id===sid?{...sc,shots:[...sc.shots,emptyShot(sc.numero,sc.shots.length+1)]}:sc));
  const rmShot=(sid,shid)=>setScenes(s=>s.map(sc=>sc.id===sid?{...sc,shots:sc.shots.filter(sh=>sh.id!==shid)}:sc));
  const rmScene=id=>setScenes(s=>s.filter(sc=>sc.id!==id));

  const readB64=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Errore lettura file"));r.readAsDataURL(f);});

  // STEP 1: Estrae lista scene dal PDF
  const handlePDF=async e=>{
    const file=e.target.files[0]; if(!file)return;
    setLoading(true);
    setMsg("📖 Lettura PDF in corso...","info");
    try{
      const b64=await readB64(file);
      if(!titolo) setTitolo(file.name.replace(/\.pdf$/i,"").replace(/_/g," "));
      setMsg("🔍 Estrazione scene dalla sceneggiatura...","info");

      const text=await apiCall([{
        role:"user",
        content:[
          {type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},
          {type:"text",text:`Analizza questa sceneggiatura e restituisci SOLO un array JSON con le scene.
Ogni elemento deve avere ESATTAMENTE questi campi:
- "numero": numero della scena come stringa (es. "1", "2")
- "location": nome della location in MAIUSCOLO (es. "CUCINA DI MARCO", "STRADA")  
- "ambientazione": solo "INT" o "EXT" o "INT/EXT"
- "momento": solo "GIORNO" o "NOTTE" o "TRAMONTO" o "ALBA"
- "riassunto": una frase che descrive cosa succede nella scena

Restituisci SOLO l'array JSON, niente altro. Niente testo prima o dopo. Niente backtick. Solo il JSON grezzo che inizia con [ e finisce con ].`}
        ]
      }],3000);

      const parsed=extractJSON(text);
      if(!Array.isArray(parsed)||parsed.length===0) throw new Error("Nessuna scena trovata nel documento");

      const ns=parsed.map((sc,i)=>({
        id:Math.random().toString(36).slice(2),
        numero:String(sc.numero||i+1),
        location:sc.location||"",
        ambientazione:["INT","EXT","INT/EXT"].includes(sc.ambientazione)?sc.ambientazione:"INT",
        momento:["GIORNO","NOTTE","TRAMONTO","ALBA"].includes(sc.momento)?sc.momento:"GIORNO",
        riassunto:sc.riassunto||"",
        collapsed:true,
        shots:[emptyShot(sc.numero||i+1,1)]
      }));

      setScenes(ns);
      setMsg(`✅ ${ns.length} scene importate! Espandi una scena e usa "✨ Genera Shot" per popolare gli shot.`,"success");
    }catch(err){
      setMsg(`❌ ${err.message}`,"error");
      console.error(err);
    }
    setLoading(false); e.target.value="";
  };

  // STEP 2: Genera shot per una singola scena
  const genSceneShots=async sc=>{
    setAiLoad(p=>({...p,[sc.id]:"shots"}));
    try{
      const text=await apiCall([{
        role:"user",
        content:`Sei un regista cinematografico esperto. Crea da 2 a 5 shot professionali per questa scena.

Scena ${sc.numero}: ${sc.location} (${sc.ambientazione} – ${sc.momento})
Descrizione: ${sc.riassunto}

Restituisci SOLO un array JSON. Niente testo, niente backtick. Solo JSON grezzo [ ... ].

Ogni shot:
{"shot":"${sc.numero}A","pagina":"","personaggi":"nomi personaggi coinvolti","tipo":"uno tra: CLL – Campo Lunghissimo|CL – Campo Lungo|CM – Campo Medio|FI – Figura Intera|PA – Piano Americano|MF – Mezza Figura|PP – Primo Piano|PPP – Primissimo Piano|Particolare|Dettaglio","descrizione":"descrizione visiva chiara","movimento":"uno tra: Statica|PAN destra|PAN sinistra|TILT su|TILT giù|Dolly avanti|Dolly indietro|Carrellata destra|Carrellata sinistra|Steadicam|Hand-held|Gru (Crane)|Drone/Aereo|Soggettiva (POV)|Low Angle|High Angle|Dutch Angle","lente":"es: 35mm o 50mm o 85mm","durata":"durata in secondi numero intero","difficolta":"facile o media o difficile o estrema","note":"nota di regia emotiva","riassunto":"max 10 parole riassunto shot"}`
      }],2000);

      const parsed=extractJSON(text);
      if(!Array.isArray(parsed)) throw new Error("Risposta non valida");

      const shots=parsed.map(sh=>({
        id:Math.random().toString(36).slice(2),
        shot:sh.shot||"",pagina:String(sh.pagina||""),personaggi:sh.personaggi||"",
        tipo:sh.tipo||"",descrizione:sh.descrizione||"",movimento:sh.movimento||"",
        lente:sh.lente||"",durata:String(sh.durata||""),
        difficolta:["facile","media","difficile","estrema"].includes(sh.difficolta)?sh.difficolta:"media",
        note:sh.note||"",riassunto:sh.riassunto||""
      }));

      setScenes(s=>s.map(x=>x.id===sc.id?{...x,shots,collapsed:false}:x));
    }catch(err){setMsg(`❌ Errore generazione shot: ${err.message}`,"error");}
    setAiLoad(p=>({...p,[sc.id]:null}));
  };

  // AI riassunto scena
  const genSceneSum=async sc=>{
    setAiLoad(p=>({...p,[sc.id]:"sum"}));
    try{
      const r=await apiCall([{role:"user",content:`Crea un riassunto narrativo di MAX 20 parole per questa scena cinematografica.
Location: ${sc.location} (${sc.ambientazione} ${sc.momento})
Shot: ${sc.shots.map(s=>s.descrizione).filter(Boolean).join("; ")||sc.riassunto}
Rispondi SOLO con il riassunto, niente altro.`}],200);
      if(r) updS(sc.id,"riassunto",r.trim());
    }catch(e){}
    setAiLoad(p=>({...p,[sc.id]:null}));
  };

  // AI riassunto shot
  const genShotSum=async(sid,sh)=>{
    setAiLoad(p=>({...p,[sh.id]:true}));
    try{
      const r=await apiCall([{role:"user",content:`Crea un riassunto tecnico di MAX 12 parole per questo shot cinematografico.
${sh.tipo} | ${sh.personaggi} | ${sh.descrizione} | ${sh.movimento} | ${sh.lente}
Rispondi SOLO con il riassunto, niente virgolette.`}],100);
      if(r) updSh(sid,sh.id,"riassunto",r.trim());
    }catch(e){}
    setAiLoad(p=>({...p,[sh.id]:false}));
  };

  const filtScenes=scenes.filter(sc=>{
    if(fAmb&&sc.ambientazione!==fAmb) return false;
    if(fMom&&sc.momento!==fMom) return false;
    if(fDiff&&!sc.shots.some(sh=>sh.difficolta===fDiff)) return false;
    if(fTxt){const q=fTxt.toLowerCase();if(!sc.location.toLowerCase().includes(q)&&!sc.shots.some(sh=>sh.descrizione.toLowerCase().includes(q)||sh.personaggi.toLowerCase().includes(q))) return false;}
    return true;
  });

  const td=calcTimes(scenes);
  const totShots=scenes.reduce((a,sc)=>a+sc.shots.length,0);

  const exportPDF=()=>{
    const style=`<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:8px;color:#111;padding:20px}
    h1{font-size:18px;font-weight:bold;margin-bottom:6px}.meta{font-size:9px;color:#555;margin-bottom:18px;display:flex;gap:20px;flex-wrap:wrap}
    .sc{margin-bottom:16px;break-inside:avoid}.sc-hd{background:#1a1a2e;color:#fff;padding:6px 10px;display:flex;gap:10px;align-items:center;font-size:10px;font-weight:bold}
    .badge{background:#7c3aed;padding:2px 8px;border-radius:3px}.rias{background:#f5f3ff;padding:5px 10px;font-size:8px;color:#555;border-left:3px solid #7c3aed;font-style:italic}
    table{width:100%;border-collapse:collapse}th{background:#2d2d44;color:#ccc;padding:4px 5px;text-align:left;font-size:7px;text-transform:uppercase;letter-spacing:.5px}
    td{padding:4px 5px;border-bottom:1px solid #e8e8e8;vertical-align:top;font-size:7.5px}tr:nth-child(even) td{background:#fafafa}
    .sid{font-weight:bold;color:#7c3aed}.rias-sh{font-style:italic;color:#888;font-size:7px}
    .lens-chg{background:#fff8e1;padding:3px 8px;font-size:7px;color:#b45309;border-left:2px solid #f59e0b}
    .df-facile{color:#16a34a;font-weight:bold}.df-media{color:#d97706;font-weight:bold}.df-difficile{color:#dc2626;font-weight:bold}.df-estrema{color:#9333ea;font-weight:bold}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>`;
    let html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titolo||"Shotlist"}</title>${style}</head><body>
    <h1>🎬 ${titolo||"Shotlist"}</h1>
    <div class="meta"><span><b>Regista:</b> ${regista||"—"}</span><span><b>Versione:</b> ${versione}</span><span><b>Data:</b> ${dataP}</span><span><b>Scene:</b> ${scenes.length}</span><span><b>Shot:</b> ${totShots}</span><span><b>Tempo stimato:</b> ${fmtTime(td.total)} (${td.days} gg)</span></div>`;
    scenes.forEach((sc,si)=>{
      const scT=td.sceneData.find(x=>x.id===sc.id);
      const locChg=si>0&&sc.location&&scenes[si-1].location&&sc.location!==scenes[si-1].location;
      if(locChg) html+=`<div style="background:#fff3cd;padding:4px 10px;font-size:7.5px;color:#856404;border-left:3px solid #ffc107;margin-bottom:4px">🔄 Cambio location → ${sc.location} (+${SETUP_MIN}min setup)</div>`;
      html+=`<div class="sc"><div class="sc-hd"><span class="badge">SC. ${sc.numero}</span><span>${sc.location}</span><span style="font-weight:normal;opacity:.7;margin-left:6px">${sc.ambientazione} – ${sc.momento}</span><span style="margin-left:auto;color:#a78bfa">${fmtTime(scT?.time||0)}</span></div>`;
      if(sc.riassunto) html+=`<div class="rias">${sc.riassunto}</div>`;
      html+=`<table><thead><tr><th>Shot</th><th>Pag</th><th>Personaggi</th><th>Tipo</th><th>Descrizione</th><th>Movimento</th><th>Lente</th><th>Durata</th><th>Diff.</th><th>Note</th></tr></thead><tbody>`;
      sc.shots.forEach((sh,shi)=>{
        const isLens=shi>0&&sh.lente&&sc.shots[shi-1]?.lente&&sh.lente!==sc.shots[shi-1].lente;
        if(isLens) html+=`<tr><td colspan="10" class="lens-chg">⚡ Cambio lente: ${sc.shots[shi-1].lente} → ${sh.lente} (+${LENS_MIN}min)</td></tr>`;
        html+=`<tr><td class="sid">${sh.shot}</td><td>${sh.pagina}</td><td>${sh.personaggi}</td><td>${sh.tipo}</td><td>${sh.descrizione}${sh.riassunto?`<br><span class="rias-sh">✦ ${sh.riassunto}</span>`:""}</td><td>${sh.movimento}</td><td>${sh.lente}</td><td>${sh.durata?sh.durata+"s":""}</td><td class="df-${sh.difficolta}">${DIFF.find(d=>d.v===sh.difficolta)?.l||""}</td><td>${sh.note}</td></tr>`;
      });
      html+=`</tbody></table></div>`;
    });
    html+=`</body></html>`;
    const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),500);
  };

  const statusColors={success:{bg:"rgba(34,197,94,0.08)",txt:"#4ade80",br:"rgba(34,197,94,0.2)"},error:{bg:"rgba(239,68,68,0.08)",txt:"#f87171",br:"rgba(239,68,68,0.2)"},info:{bg:"rgba(139,92,246,0.08)",txt:"#a78bfa",br:"rgba(139,92,246,0.2)"}};
  const sc=statusColors[statusType]||statusColors.info;

  return(
    <div style={{minHeight:"100vh",background:"#07070e",color:"#e2e2f0",fontFamily:"system-ui,-apple-system,sans-serif"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(180deg,#111127 0%,#090915 100%)",borderBottom:"1px solid rgba(139,92,246,0.2)",padding:"14px 20px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:12}}>
          <div style={{fontWeight:900,fontSize:18,letterSpacing:3,background:"linear-gradient(135deg,#7c3aed,#c026d3)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>◉ SHOTLIST PRO</div>
          <div style={{display:"flex",gap:8,marginLeft:"auto",flexWrap:"wrap"}}>
            <button onClick={()=>fileRef.current.click()} disabled={loading}
              style={{background:loading?"#1a1a2e":"linear-gradient(135deg,#7c3aed,#c026d3)",border:"none",color:loading?"#555":"#fff",padding:"7px 16px",borderRadius:6,cursor:loading?"not-allowed":"pointer",fontWeight:"bold",fontSize:11}}>
              {loading?"⏳ Analisi PDF...":"📄 Importa Sceneggiatura PDF"}
            </button>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handlePDF} style={{display:"none"}}/>
            <button onClick={()=>setShowTime(v=>!v)}
              style={{background:showTime?"rgba(139,92,246,0.2)":"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e2f0",padding:"7px 14px",borderRadius:6,cursor:"pointer",fontWeight:"bold",fontSize:11}}>
              ⏱ Tempi {fmtTime(td.total)}
            </button>
            <button onClick={exportPDF}
              style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e2f0",padding:"7px 14px",borderRadius:6,cursor:"pointer",fontWeight:"bold",fontSize:11}}>
              🖨 Esporta PDF
            </button>
            <button onClick={()=>setScenes(s=>[...s,emptyScene(s.length+1)])}
              style={{background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.3)",color:"#c084fc",padding:"7px 14px",borderRadius:6,cursor:"pointer",fontWeight:"bold",fontSize:11}}>
              + Scena
            </button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"3fr 2fr 1fr 1.2fr",gap:8}}>
          {[{l:"Titolo Progetto",v:titolo,s:setTitolo,p:"Es. La Notte di Roma",t:"text"},{l:"Regista",v:regista,s:setRegista,p:"Nome regista",t:"text"},{l:"Versione",v:versione,s:setVersione,p:"v1.0",t:"text"},{l:"Data",v:dataP,s:setDataP,p:"",t:"date"}].map(f=>(
            <div key={f.l}>
              <div style={{fontSize:8,color:"#4a4a68",marginBottom:3,textTransform:"uppercase",letterSpacing:.8}}>{f.l}</div>
              <input type={f.t} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p}
                style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#e2e2f0",padding:"5px 8px",borderRadius:5,fontSize:12,width:"100%"}}/>
            </div>
          ))}
        </div>
      </div>

      {/* STATUS */}
      {status&&<div style={{background:sc.bg,color:sc.txt,border:`1px solid ${sc.br}`,padding:"8px 20px",fontSize:11}}>{status}</div>}

      {/* FILTERS */}
      <div style={{background:"rgba(255,255,255,0.012)",borderBottom:"1px solid rgba(255,255,255,0.04)",padding:"8px 20px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:9,color:"#4a4a68",textTransform:"uppercase",letterSpacing:.8}}>Filtri</span>
        <input value={fTxt} onChange={e=>setFTxt(e.target.value)} placeholder="Cerca location, personaggio..."
          style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#e2e2f0",padding:"4px 10px",borderRadius:5,fontSize:10,flex:1,minWidth:160}}/>
        {[{l:"Difficoltà",v:fDiff,s:setFDiff,opts:DIFF.map(d=>({v:d.v,l:d.l,c:d.c}))},
          {l:"INT/EXT",v:fAmb,s:setFAmb,opts:["INT","EXT","INT/EXT"].map(x=>({v:x,l:x}))},
          {l:"Momento",v:fMom,s:setFMom,opts:["GIORNO","NOTTE","TRAMONTO","ALBA"].map(x=>({v:x,l:x}))}
        ].map(f=>(
          <select key={f.l} value={f.v} onChange={e=>f.s(e.target.value)}
            style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:f.v&&f.opts.find(o=>o.v===f.v)?.c||"#9090a0",padding:"4px 8px",borderRadius:5,fontSize:10,cursor:"pointer"}}>
            <option value="" style={{color:"#9090a0"}}>{f.l}</option>
            {f.opts.map(o=><option key={o.v} value={o.v} style={{color:o.c||"#e2e2f0"}}>{o.l}</option>)}
          </select>
        ))}
        {(fTxt||fDiff||fAmb||fMom)&&<button onClick={()=>{setFTxt("");setFDiff("");setFAmb("");setFMom("");}}
          style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#f87171",padding:"4px 10px",borderRadius:5,fontSize:10,cursor:"pointer"}}>
          ✕ Reset</button>}
        <span style={{fontSize:9,color:"#4a4a68",whiteSpace:"nowrap",marginLeft:"auto"}}>{totShots} shot · {scenes.length} scene</span>
      </div>

      {/* TIME PANEL */}
      {showTime&&(
        <div style={{background:"rgba(124,58,237,0.06)",border:"1px solid rgba(124,58,237,0.15)",margin:"12px 20px",borderRadius:10,padding:"16px 20px"}}>
          <div style={{fontWeight:"bold",fontSize:14,color:"#a78bfa",marginBottom:12}}>⏱ Stima Tempi di Produzione</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {[{l:"Tempo Totale",v:fmtTime(td.total),c:"#a78bfa"},{l:"Giorni Ripresa",v:`${td.days} gg`,c:"#22c55e"},{l:"Shot Totali",v:totShots,c:"#f59e0b"},{l:"Scene Totali",v:scenes.length,c:"#60a5fa"}].map(it=>(
              <div key={it.l} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:8,color:"#6b6b80",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{it.l}</div>
                <div style={{fontSize:22,fontWeight:"bold",color:it.c}}>{it.v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {td.sceneData.map((sd,i)=>{
              const prev=scenes[i-1];
              const locChg=prev&&prev.location&&sd.location&&prev.location!==sd.location;
              return(<div key={sd.id}>
                {locChg&&<div style={{fontSize:9,color:"#f59e0b",padding:"1px 0 1px 40px"}}>↳ +{SETUP_MIN}min cambio location</div>}
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"2px 0"}}>
                  <span style={{background:"rgba(124,58,237,0.2)",color:"#a78bfa",padding:"1px 7px",borderRadius:3,fontWeight:"bold",fontSize:9,minWidth:28,textAlign:"center"}}>{sd.numero}</span>
                  <span style={{flex:1,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#9090a0"}}>{sd.location||"—"}</span>
                  <span style={{color:"#a78bfa",fontWeight:"bold",fontSize:11}}>{fmtTime(sd.time)}</span>
                </div>
              </div>);
            })}
          </div>
          <div style={{fontSize:8,color:"#3a3a50",marginTop:10,borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:8}}>
            * Facile=20min · Media=45min · Difficile=90min · Molto Difficile=150min · Cambio lente=+5min · Cambio location=+45min · Giornata=10h
          </div>
        </div>
      )}

      {/* SCENE LIST */}
      <div style={{padding:"12px 20px 60px"}}>
        {filtScenes.length===0&&<div style={{textAlign:"center",color:"#3a3a50",padding:"60px 0",fontSize:13}}>Nessuna scena. Importa un PDF o aggiungi scene manualmente.</div>}
        {filtScenes.map(sc=>{
          const scT=td.sceneData.find(x=>x.id===sc.id);
          const filtShots=fDiff?sc.shots.filter(sh=>sh.difficolta===fDiff):sc.shots;
          const isLoadingShots=aiLoad[sc.id]==="shots";
          const isLoadingSum=aiLoad[sc.id]==="sum";
          return(
            <div key={sc.id} style={{marginBottom:10,borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,255,255,0.06)",boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
              {/* SCENE HEADER */}
              <div onClick={()=>updS(sc.id,"collapsed",!sc.collapsed)}
                style={{background:"linear-gradient(135deg,rgba(124,58,237,0.15),rgba(192,38,211,0.06))",padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{background:"linear-gradient(135deg,#7c3aed,#c026d3)",color:"#fff",fontWeight:"bold",fontSize:11,padding:"3px 10px",borderRadius:5,minWidth:30,textAlign:"center"}}>{sc.numero}</span>
                <input value={sc.location} placeholder="NOME LOCATION"
                  onChange={e=>{e.stopPropagation();updS(sc.id,"location",e.target.value);}}
                  onClick={e=>e.stopPropagation()}
                  style={{background:"transparent",border:"none",color:"#fff",fontSize:13,fontWeight:"bold",flex:1,minWidth:100,outline:"none"}}/>
                {[{v:sc.ambientazione,k:"ambientazione",opts:["INT","EXT","INT/EXT"]},{v:sc.momento,k:"momento",opts:["GIORNO","NOTTE","TRAMONTO","ALBA"]}].map(f=>(
                  <select key={f.k} value={f.v} onChange={e=>{e.stopPropagation();updS(sc.id,f.k,e.target.value);}} onClick={e=>e.stopPropagation()}
                    style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",padding:"3px 6px",borderRadius:4,fontSize:10,cursor:"pointer"}}>
                    {f.opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                ))}
                <span style={{fontSize:9,color:"#4a4a68",whiteSpace:"nowrap"}}>{sc.shots.length} shot · {fmtTime(scT?.time||0)}</span>

                {/* AI GENERA SHOT */}
                <button onClick={e=>{e.stopPropagation();genSceneShots(sc);}} disabled={isLoadingShots}
                  title="Genera shot AI per questa scena"
                  style={{background:isLoadingShots?"rgba(0,0,0,0.2)":"rgba(124,58,237,0.3)",border:"1px solid rgba(124,58,237,0.5)",color:isLoadingShots?"#555":"#c084fc",padding:"3px 10px",borderRadius:4,cursor:isLoadingShots?"not-allowed":"pointer",fontSize:10,fontWeight:"bold",whiteSpace:"nowrap"}}>
                  {isLoadingShots?"⏳ Genero...":"✨ Genera Shot"}
                </button>

                {/* AI RIASSUNTO SCENA */}
                <button onClick={e=>{e.stopPropagation();genSceneSum(sc);}} disabled={isLoadingSum}
                  title="Genera riassunto scena"
                  style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#6b6b80",padding:"3px 8px",borderRadius:4,cursor:"pointer",fontSize:10}}>
                  {isLoadingSum?"...":"≡"}
                </button>
                <button onClick={e=>{e.stopPropagation();rmScene(sc.id);}}
                  style={{background:"none",border:"none",color:"#2d2d44",cursor:"pointer",fontSize:14,padding:"0 2px"}}>✕</button>
                <span style={{color:"#2d2d44",fontSize:10}}>{sc.collapsed?"▶":"▼"}</span>
              </div>

              {sc.riassunto&&<div style={{background:"rgba(124,58,237,0.06)",padding:"5px 14px",fontSize:10,color:"#7c6fa0",fontStyle:"italic",borderLeft:"3px solid rgba(124,58,237,0.4)"}}>✦ {sc.riassunto}</div>}

              {/* SHOTS */}
              {!sc.collapsed&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"50px 38px 105px 138px 1fr 128px 90px 52px 82px 1fr 42px",gap:4,padding:"6px 10px 4px",background:"rgba(0,0,0,0.3)"}}>
                    {["Shot","Pag.","Personaggi","Tipo Inq.","Descrizione","Movimento","Lente","Dur.","Difficoltà","Note Regia",""].map((h,i)=>(
                      <div key={i} style={{fontSize:7.5,color:"#3a3a54",textTransform:"uppercase",letterSpacing:.7}}>{h}</div>
                    ))}
                  </div>
                  {filtShots.map((sh,shi)=>{
                    const diff=DIFF.find(d=>d.v===sh.difficolta)||DIFF[1];
                    const allShots=sc.shots;
                    const gi=allShots.findIndex(s=>s.id===sh.id);
                    const isLens=gi>0&&sh.lente&&allShots[gi-1]?.lente&&sh.lente!==allShots[gi-1].lente;
                    return(
                      <div key={sh.id}>
                        {isLens&&<div style={{padding:"3px 10px",background:"rgba(245,158,11,0.06)",fontSize:9,color:"#f59e0b",borderLeft:"2px solid rgba(245,158,11,0.4)",display:"flex",gap:6,alignItems:"center"}}>
                          <span>⚡</span><span style={{fontWeight:"bold"}}>Cambio lente</span><span style={{color:"#6b5e40"}}>{allShots[gi-1].lente} → {sh.lente}</span><span style={{color:"#4a3f2f"}}>+{LENS_MIN}min</span>
                        </div>}
                        <div style={{background:shi%2===0?"transparent":"rgba(255,255,255,0.018)",borderTop:"1px solid rgba(255,255,255,0.03)"}}>
                          <div style={{display:"grid",gridTemplateColumns:"50px 38px 105px 138px 1fr 128px 90px 52px 82px 1fr 42px",gap:4,padding:"6px 10px",alignItems:"start"}}>
                            <input value={sh.shot} onChange={e=>updSh(sc.id,sh.id,"shot",e.target.value)}
                              style={{...iStyle({fontWeight:"bold",color:"#a78bfa",fontSize:12})}}/>
                            <input value={sh.pagina} onChange={e=>updSh(sc.id,sh.id,"pagina",e.target.value)}
                              placeholder="—" style={{...iStyle({color:"#4a4a68",textAlign:"center"})}}/>
                            <input value={sh.personaggi} onChange={e=>updSh(sc.id,sh.id,"personaggi",e.target.value)}
                              placeholder="Personaggi..." style={iStyle({fontSize:10,color:"#94a3b8"})}/>
                            <select value={sh.tipo} onChange={e=>updSh(sc.id,sh.id,"tipo",e.target.value)} style={selStyle()}>
                              <option value="">Piano...</option>
                              {TIPI.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                            <textarea value={sh.descrizione} onChange={e=>updSh(sc.id,sh.id,"descrizione",e.target.value)}
                              placeholder="Descrizione visiva..." rows={Math.max(2,Math.ceil((sh.descrizione||"").length/40))}
                              style={{background:"transparent",border:"none",color:"#e2e2f0",fontSize:10,padding:"2px 0",outline:"none",width:"100%",resize:"none",lineHeight:1.55,fontFamily:"inherit"}}/>
                            <select value={sh.movimento} onChange={e=>updSh(sc.id,sh.id,"movimento",e.target.value)} style={selStyle()}>
                              <option value="">Movimento...</option>
                              {MOVIMENTI.map(m=><option key={m} value={m}>{m}</option>)}
                            </select>
                            <select value={sh.lente} onChange={e=>updSh(sc.id,sh.id,"lente",e.target.value)} style={selStyle()}>
                              <option value="">Lente...</option>
                              {LENTI.map(l=><option key={l} value={l}>{l}</option>)}
                            </select>
                            <div style={{display:"flex",alignItems:"center",gap:2}}>
                              <input value={sh.durata} onChange={e=>updSh(sc.id,sh.id,"durata",e.target.value)}
                                type="number" min="0" placeholder="—"
                                style={{...iStyle({width:34,textAlign:"center",color:"#60a5fa"})}}/>
                              <span style={{fontSize:8,color:"#3a3a54"}}>s</span>
                            </div>
                            <select value={sh.difficolta} onChange={e=>updSh(sc.id,sh.id,"difficolta",e.target.value)}
                              style={{...selStyle(diff.c),fontWeight:"bold"}}>
                              {DIFF.map(d=><option key={d.v} value={d.v} style={{color:d.c}}>{d.l}</option>)}
                            </select>
                            <input value={sh.note} onChange={e=>updSh(sc.id,sh.id,"note",e.target.value)}
                              placeholder="Note regia..." style={iStyle({fontSize:10,color:"#7c7c90"})}/>
                            <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center",paddingTop:2}}>
                              <button onClick={()=>genShotSum(sc.id,sh)} disabled={aiLoad[sh.id]}
                                title="Genera riassunto shot"
                                style={{background:"none",border:"none",color:aiLoad[sh.id]?"#333":"#7c3aed",cursor:"pointer",fontSize:14,padding:0,lineHeight:1}}>
                                {aiLoad[sh.id]?"⏳":"✨"}
                              </button>
                              <button onClick={()=>rmShot(sc.id,sh.id)}
                                style={{background:"none",border:"none",color:"#2a2a3a",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                            </div>
                          </div>
                          {sh.riassunto&&<div style={{padding:"0 10px 6px 54px",fontSize:9,color:"#5b4a7a",fontStyle:"italic"}}>✦ {sh.riassunto}</div>}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{padding:"6px 10px",background:"rgba(0,0,0,0.2)"}}>
                    <button onClick={()=>addShot(sc.id)}
                      style={{background:"none",border:"1px dashed rgba(255,255,255,0.06)",color:"#3a3a54",padding:"5px",borderRadius:5,cursor:"pointer",fontSize:10,width:"100%"}}>
                      + Aggiungi Shot
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={()=>setScenes(s=>[...s,emptyScene(s.length+1)])}
          style={{background:"rgba(255,255,255,0.012)",border:"2px dashed rgba(255,255,255,0.05)",color:"#3a3a54",padding:12,borderRadius:10,cursor:"pointer",fontSize:12,width:"100%",marginTop:4}}>
          + Aggiungi Scena
        </button>
      </div>
    </div>
  );
}
