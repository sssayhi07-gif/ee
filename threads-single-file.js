(function(window){
  'use strict';
  // Threads — Single-file, zero-deps (localStorage persistence)
  // ---------------------------------------------------------
  // Features: Home feed, Detail view, Replies (1-level list), Likes, Composer,
  // Theme toggle (dark/light), Simple linkify, Persistent storage.
  // Exposes window.ThreadsApp { init(), render(), version }.

  // ====== Config ======
  const CONFIG = {
    STORAGE_KEY: 'threadsStore:v1',
    APP_ID: 'threads-screen',
    THEME_CLASS_LIGHT: 'th-light',
  };

  // ====== Utilities ======
  const $$ = (sel, scope=document) => scope.querySelector(sel);
  const $$$ = (sel, scope=document) => Array.from(scope.querySelectorAll(sel));
  const now = () => Date.now();
  const uid = () => 'p_' + now() + '_' + Math.random().toString(36).slice(2,8);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }
  function linkify(text){
    const safe = escapeHtml(text);
    return safe
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1<\/a>')
      .replace(/(^|\s)#(\w+)/g, '$1<a href="#" class="th-hashtag">#$2<\/a>')
      .replace(/(^|\s)@(\w+)/g, '$1<a href="#" class="th-mention">@$2<\/a>');
  }
  function formatTime(ts){
    try{
      const d = new Date(ts);
      const isToday = (new Date().toDateString() === d.toDateString());
      return isToday ? d.toLocaleTimeString() : d.toLocaleString();
    }catch{ return '' }
  }

  // ====== Minimal Store (localStorage) ======
  const Store = {
    load(){
      try{
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        return raw ? JSON.parse(raw) : { posts: [], profiles: [] };
      }catch(e){ return { posts: [], profiles: [] }; }
    },
    save(data){
      try{ localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data)); }catch(e){}
    },
    clear(){ localStorage.removeItem(CONFIG.STORAGE_KEY); },
  };

  // Data shape
  // post: { id, parentId|null, author:{name,handle,avatar?}, text, createdAt, likeCount, likedByMe, replyCount }

  // ====== Data APIs ======
  const Data = {
    async listRoot(limit=50){
      const db = Store.load();
      const roots = db.posts.filter(p=>!p.parentId).sort((a,b)=>b.createdAt - a.createdAt);
      return roots.slice(0, limit);
    },
    async get(id){ return Store.load().posts.find(p=>p.id===id) || null; },
    async listReplies(parentId){
      const db = Store.load();
      return db.posts.filter(p=>p.parentId===parentId).sort((a,b)=>a.createdAt-b.createdAt);
    },
    async put(post){
      const db = Store.load();
      const i = db.posts.findIndex(p=>p.id===post.id);
      if(i>=0) db.posts[i] = post; else db.posts.push(post);
      Store.save(db);
    },
    async update(id, patch){
      const db = Store.load();
      const i = db.posts.findIndex(p=>p.id===id);
      if(i<0) return;
      db.posts[i] = { ...db.posts[i], ...patch };
      Store.save(db);
    },
    async create({ text, parentId=null, author }){
      const post = {
        id: uid(), parentId,
        author: author || { name:'AI Persona', handle:'@ai' },
        text: text || '',
        createdAt: now(),
        likeCount: 0, likedByMe: false, replyCount: 0
      };
      const db = Store.load();
      db.posts.push(post);
      if(parentId){
        const pi = db.posts.findIndex(p=>p.id===parentId);
        if(pi>=0) db.posts[pi].replyCount = (db.posts[pi].replyCount||0)+1;
      }
      Store.save(db);
      return post;
    },
    async toggleLike(id){
      const db = Store.load();
      const i = db.posts.findIndex(p=>p.id===id);
      if(i<0) return null;
      const liked = !db.posts[i].likedByMe;
      db.posts[i].likedByMe = liked;
      db.posts[i].likeCount = clamp((db.posts[i].likeCount||0) + (liked?1:-1), 0, 1e9);
      Store.save(db);
      return db.posts[i];
    },
    async remove(id){
      const db = Store.load();
      const p = db.posts.find(x=>x.id===id);
      if(!p) return;
      // remove children first (shallow cascade)
      db.posts = db.posts.filter(x=>x.id!==id && x.parentId!==id);
      if(p.parentId){
        const pi = db.posts.findIndex(x=>x.id===p.parentId);
        if(pi>=0) db.posts[pi].replyCount = Math.max(0, (db.posts[pi].replyCount||1)-1);
      }
      Store.save(db);
    }
  };

  // ====== Styles ======
  function injectStyles(){
    if(document.getElementById('threads-styles')) return;
    const css = `
#${CONFIG.APP_ID}{--th-bg:#000;--th-bg-soft:#111;--th-border:#2f3336;--th-text:#fff;--th-sub:#8899a6;--th-accent:#1d9bf0;height:100vh;display:flex;flex-direction:column;background:var(--th-bg);color:var(--th-text);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
#${CONFIG.APP_ID}.${CONFIG.THEME_CLASS_LIGHT}{--th-bg:#fff;--th-bg-soft:#f7f9f9;--th-border:#e6ecf0;--th-text:#0f1419;--th-sub:#536471}
.th-topbar{height:53px;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid var(--th-border);gap:12px}
.th-topbar .th-title{font-weight:800}
.th-feed{flex:1;overflow-y:auto}
.th-item{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--th-border)}
.th-avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#999,#666)}
.th-main{flex:1;min-width:0}
.th-user{font-weight:700}
.th-handle,.th-time{color:var(--th-sub);font-size:12px}
.th-actions{display:flex;gap:24px;margin-top:8px;color:var(--th-sub)}
.th-actions .act{cursor:pointer}
.th-actions .act:hover{color:var(--th-accent)}
.th-composer{border-top:1px solid var(--th-border);padding:10px 16px;display:flex;gap:8px;align-items:flex-start}
.th-composer textarea{flex:1;resize:none;border:1px solid var(--th-border);background:var(--th-bg-soft);color:var(--th-text);border-radius:12px;padding:10px;min-height:44px}
.th-btn{background:var(--th-accent);border:none;color:#fff;border-radius:999px;padding:8px 14px;cursor:pointer}
.th-btn.secondary{background:transparent;color:var(--th-accent);border:1px solid var(--th-accent)}
.th-reply{margin-left:52px;border-left:1px solid var(--th-border)}
.th-empty{padding:16px;color:var(--th-sub)}
.th-row{display:flex;align-items:center;gap:8px}
.th-spacer{flex:1}
    `;
    const style = document.createElement('style');
    style.id = 'threads-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ====== Renderers ======
  let currentPage = 'home';
  let currentDetailId = null;

  function shell(){
    return `
      <div class="th-topbar">
        <span class="th-title">Threads</span>
        <div class="th-spacer"></div>
        <button class="th-btn secondary" id="th-theme">主題</button>
        <button class="th-btn" id="th-new-post">發佈</button>
      </div>
      <div id="th-content" class="th-feed"></div>
      <div class="th-composer">
        <div class="th-avatar"></div>
        <textarea id="th-text" placeholder="開始一則新貼文…"></textarea>
        <button class="th-btn" id="th-send">送出</button>
      </div>
    `;
  }

  async function renderHome(){
    currentPage = 'home';
    const el = $$('#th-content');
    const posts = await Data.listRoot(50);
    el.innerHTML = posts.length ? posts.map(p=>renderItem(p)).join('') : `<div class="th-empty">還沒有貼文，來發第一則吧！</div>`;
    wireItemEvents(el);
  }

  async function renderDetail(postId){
    currentPage = 'detail';
    currentDetailId = postId;
    const el = $$('#th-content');
    const post = await Data.get(postId);
    if(!post){ el.innerHTML = '<div class="th-empty">貼文不存在或已被刪除。</div>'; return; }
    const replies = await Data.listReplies(postId);
    el.innerHTML = `${renderItem(post,{showTime:true,showDelete:true})}${replies.map(r=>renderItem(r,{isReply:true,showDelete:true})).join('')}`;
    wireItemEvents(el);
  }

  function renderItem(p, opts={}){
    const time = formatTime(p.createdAt);
    return `
      <div class="th-item ${opts.isReply?'th-reply':''}" data-id="${p.id}">
        <div class="th-avatar"></div>
        <div class="th-main">
          <div class="th-row">
            <span class="th-user">${escapeHtml(p.author.name)}</span>
            <span class="th-handle">${escapeHtml(p.author.handle)}</span>
            ${opts.showTime?`· <span class="th-time">${escapeHtml(time)}</span>`:''}
            <span class="th-spacer"></span>
            ${opts.showDelete?`<button class="th-btn secondary th-del-btn">刪除</button>`:''}
          </div>
          <div class="th-text">${linkify(p.text)}</div>
          <div class="th-actions">
            <span class="act th-reply-btn">回覆</span>
            <span class="act th-like-btn">${p.likedByMe?'已讚':'讚'}（${p.likeCount}）</span>
            <span class="act th-open-btn">開啟</span>
          </div>
        </div>
      </div>
    `;
  }

  function bindTopbar(){
    $$('#th-theme').onclick = toggleTheme;
    $$('#th-send').onclick = async ()=>{
      const ta = $$('#th-text');
      const text = (ta.value||'').trim();
      if(!text) return;
      await Data.create({ text, parentId: null });
      ta.value = '';
      currentPage==='home' ? renderHome() : renderDetail(currentDetailId);
    };
    $$('#th-new-post').onclick = ()=> { $$('#th-text').focus(); };
  }

  function wireItemEvents(scope){
    $$$('.th-open-btn', scope).forEach(btn=>{
      btn.onclick = (e)=>{
        const id = e.target.closest('.th-item').dataset.id;
        renderDetail(id);
      };
    });
    $$$('.th-reply-btn', scope).forEach(btn=>{
      btn.onclick = async (e)=>{
        const id = e.target.closest('.th-item').dataset.id;
        const text = prompt('回覆內容？');
        if(!text) return;
        await Data.create({ text, parentId: id });
        renderDetail(currentDetailId || id);
      };
    });
    $$$('.th-like-btn', scope).forEach(btn=>{
      btn.onclick = async (e)=>{
        const id = e.target.closest('.th-item').dataset.id;
        await Data.toggleLike(id);
        currentPage==='home' ? renderHome() : renderDetail(currentDetailId);
      };
    });
    $$$('.th-del-btn', scope).forEach(btn=>{
      btn.onclick = async (e)=>{
        const id = e.target.closest('.th-item').dataset.id;
        if(confirm('確定刪除此貼文與其回覆？')){
          await Data.remove(id);
          currentPage==='home' ? renderHome() : renderDetail(currentDetailId);
        }
      };
    });
  }

  // ====== Theme ======
  function getHost(){
    let host = document.getElementById(CONFIG.APP_ID);
    if(!host){
      host = document.createElement('div');
      host.id = CONFIG.APP_ID;
      document.body.appendChild(host);
    }
    return host;
  }
  function toggleTheme(){
    const host = getHost();
    host.classList.toggle(CONFIG.THEME_CLASS_LIGHT);
    try{ localStorage.setItem('threadsTheme', host.classList.contains(CONFIG.THEME_CLASS_LIGHT)?'light':'dark'); }catch{}
  }
  function loadTheme(){
    try{
      const t = localStorage.getItem('threadsTheme');
      const host = getHost();
      if(t==='light') host.classList.add(CONFIG.THEME_CLASS_LIGHT);
    }catch{}
  }

  // ====== Init & Public API ======
  function render(){
    injectStyles();
    const host = getHost();
    host.innerHTML = shell();
    loadTheme();
    bindTopbar();
    renderHome();
  }
  function init(){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
  }

  window.ThreadsApp = { init, render, version: '1.0.0' };
  // Auto-init
  init();

})(window);
