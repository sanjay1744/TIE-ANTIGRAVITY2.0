(function(){
  var params=new URLSearchParams(window.location.search);
  var role=params.has('presenter')?'presenter':'viewer';
  var presenterKey=params.get('key')||'';
  var ws=null;
  var isSynced=true;
  var lastSyncIndex=0;
  var reconnectDelay=1000;
  var _remoteAction=false;

  // UI refs
  var roleEl=document.getElementById('collabRole');
  var syncBtn=document.getElementById('collabSyncBtn');
  var viewersEl=document.getElementById('collabViewers');

  // Init UI
  if(roleEl){
    roleEl.textContent=role.toUpperCase();
    roleEl.className='collab-role '+role;
  }
  if(syncBtn){
    if(role==='presenter'){
      syncBtn.style.display='none';
    }else{
      syncBtn.textContent='Following';
      syncBtn.className='collab-sync-btn synced';
      syncBtn.addEventListener('click',toggleSync);
    }
  }

  function toggleSync(){
    isSynced=!isSynced;
    if(isSynced){
      syncBtn.textContent='Following';
      syncBtn.className='collab-sync-btn synced';
      var idx=lastSyncIndex;
      if(window.Presentation){
        if(window.Presentation.isTransitioning()){
          setTimeout(function(){window.Presentation.goTo(idx,{remote:true})},150);
        }else{
          window.Presentation.goTo(idx,{remote:true});
        }
      }
      showToast('Synced to slide '+(idx+1));
    }else{
      syncBtn.textContent='Browsing';
      syncBtn.className='collab-sync-btn unsynced';
    }
  }

  function showToast(msg){
    var old=document.querySelector('.sync-toast');
    if(old)old.remove();
    var t=document.createElement('div');
    t.className='sync-toast';
    t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(function(){if(t.parentNode)t.remove()},2200);
  }

  function send(msg){
    if(ws&&ws.readyState===1)ws.send(JSON.stringify(msg));
  }

  // ---- Video Sync ----
  function getVideo(id){
    return document.getElementById(id);
  }

  // Presenter: listen to native video events and forward
  function setupVideoSend(){
    var videoIds=['screenVideo','collabVideo','cliVideo'];
    videoIds.forEach(function(id){
      var v=getVideo(id);
      if(!v)return;
      v.addEventListener('play',function(){
        if(_remoteAction)return;
        send({type:'video_action',videoId:id,action:'play'});
      });
      v.addEventListener('pause',function(){
        if(_remoteAction)return;
        send({type:'video_action',videoId:id,action:'pause'});
      });
      v.addEventListener('seeked',function(){
        if(_remoteAction)return;
        send({type:'video_action',videoId:id,action:'seek',time:v.currentTime});
      });
    });

    // Listen for zoom events from inline scripts
    window.addEventListener('videoZoom',function(e){
      send({type:'video_action',videoId:e.detail.videoId,action:e.detail.zoomed?'zoom':'unzoom'});
    });
  }

  // Viewer: apply remote video actions
  function applyVideoAction(msg){
    if(role!=='viewer')return;
    var v=getVideo(msg.videoId);
    if(!v)return;

    _remoteAction=true;

    if(msg.action==='play'){
      v.play().catch(function(){});
    }else if(msg.action==='pause'){
      v.pause();
    }else if(msg.action==='seek'){
      v.currentTime=msg.time;
    }else if(msg.action==='zoom'||msg.action==='unzoom'){
      var isZoomed=v.classList.contains('zoomed');
      if(msg.action==='zoom'&&!isZoomed){
        v.click();
      }else if(msg.action==='unzoom'&&isZoomed){
        v.click();
      }
    }

    setTimeout(function(){
      _remoteAction=false;
    },100);
  }

  // Setup video listeners after DOM ready
  if(role==='presenter'){
    setupVideoSend();
  }

  // ---- WebSocket ----
  function connect(){
    var proto=window.location.protocol==='https:'?'wss':'ws';
    var url=proto+'://'+window.location.host+'/ws';
    ws=new WebSocket(url);

    ws.onopen=function(){
      ws.send(JSON.stringify({type:'join',role:role,key:presenterKey}));
      reconnectDelay=1000;
    };

    ws.onmessage=function(e){
      var msg;
      try{msg=JSON.parse(e.data)}catch{return}
      switch(msg.type){
        case 'sync':
          lastSyncIndex=msg.index;
          if(role==='viewer'&&isSynced&&window.Presentation){
            if(window.Presentation.isTransitioning()){
              setTimeout(function(){window.Presentation.goTo(msg.index,{remote:true})},150);
            }else{
              window.Presentation.goTo(msg.index,{remote:true});
            }
          }
          break;
        case 'video_action':
          if(role==='viewer'&&isSynced)applyVideoAction(msg);
          break;
        case 'viewer_count':
          if(role==='presenter'&&viewersEl){
            viewersEl.style.display='block';
            viewersEl.textContent=msg.count+' viewer'+(msg.count!==1?'s':'');
          }
          break;
        case 'presenter_offline':
          if(role==='viewer'&&syncBtn){
            syncBtn.textContent='No presenter';
            syncBtn.className='collab-sync-btn unsynced';
          }
          break;
        case 'error':
          showToast(msg.message);
          break;
      }
    };

    ws.onclose=function(){
      ws=null;
      setTimeout(function(){
        reconnectDelay=Math.min(reconnectDelay*2,10000);
        connect();
      },reconnectDelay);
    };

    ws.onerror=function(){};
  }

  connect();

  // Listen for local slide changes
  window.addEventListener('slideChange',function(e){
    if(e.detail.remote)return;
    if(role==='presenter'){
      send({type:'slide_change',index:e.detail.index});
    }else if(role==='viewer'&&isSynced){
      isSynced=false;
      syncBtn.textContent='Browsing';
      syncBtn.className='collab-sync-btn unsynced';
    }
  });
})();
