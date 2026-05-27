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
  var controlBtn=document.getElementById('presenterControlBtn');
  var isActivePresenter=false;

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
  if(controlBtn){
    if(role==='presenter'){
      controlBtn.style.display='flex';
      controlBtn.addEventListener('click',function(){
        send({type:'claim_presenter'});
      });
    }
  }

  function setActivePresenterUI(active){
    isActivePresenter=active;
    if(!controlBtn)return;
    if(active){
      controlBtn.className='presenter-control-btn active';
      controlBtn.innerHTML='<span class="control-dot"></span>Live';
    }else{
      controlBtn.className='presenter-control-btn';
      controlBtn.innerHTML='Take Control';
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
        if(!isActivePresenter)return;
        send({type:'video_action',videoId:id,action:'play'});
      });
      v.addEventListener('pause',function(){
        if(_remoteAction)return;
        if(!isActivePresenter)return;
        send({type:'video_action',videoId:id,action:'pause'});
      });
      v.addEventListener('seeked',function(){
        if(_remoteAction)return;
        if(!isActivePresenter)return;
        send({type:'video_action',videoId:id,action:'seek',time:v.currentTime});
      });
    });

    // Listen for zoom events from inline scripts
    window.addEventListener('videoZoom',function(e){
      if(!isActivePresenter)return;
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
        case 'presenter_promoted':
          if(role==='presenter'){
            setActivePresenterUI(true);
            showToast('You are now the active presenter');
          }
          break;
        case 'presenter_demoted':
          if(role==='presenter'){
            setActivePresenterUI(false);
            showToast('Another presenter took control');
          }
          break;
        case 'presenter_status':
          break;
        case 'role_confirm':
          if(msg.role==='presenter'&&msg.isActive){
            setActivePresenterUI(true);
          }
          break;
        case 'chat':
          addChatMessage(msg);
          break;
        case 'chat_history':
          msg.messages.forEach(addChatMessage);
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
      if(isActivePresenter){
        send({type:'slide_change',index:e.detail.index});
      }
    }else if(role==='viewer'&&isSynced){
      isSynced=false;
      syncBtn.textContent='Browsing';
      syncBtn.className='collab-sync-btn unsynced';
    }
  });

  // ---- Chat ----
  var chatToggle=document.getElementById('chatToggle');
  var chatPanel=document.getElementById('chatPanel');
  var chatClose=document.getElementById('chatClose');
  var chatMessages=document.getElementById('chatMessages');
  var chatEmpty=document.getElementById('chatEmpty');
  var chatFormat='text';

  if(chatToggle){
    chatToggle.addEventListener('click',function(){
      chatPanel.classList.add('open');
      chatToggle.style.display='none';
    });
  }
  if(chatClose){
    chatClose.addEventListener('click',function(){
      chatPanel.classList.remove('open');
      chatToggle.style.display='';
    });
  }

  // Build presenter input area
  if(role==='presenter'){
    var inputArea=document.createElement('div');
    inputArea.className='chat-input-area';
    inputArea.innerHTML='<div class="chat-format-toggle">'
      +'<button class="chat-format-btn active" data-format="text">Text</button>'
      +'<button class="chat-format-btn" data-format="code">Code</button>'
      +'</div>'
      +'<div class="chat-input-row">'
      +'<textarea class="chat-input" id="chatInput" placeholder="Type a message..." rows="1"></textarea>'
      +'<button class="chat-send" id="chatSend">Send</button>'
      +'</div>';
    chatPanel.appendChild(inputArea);

    var fmtBtns=inputArea.querySelectorAll('.chat-format-btn');
    fmtBtns.forEach(function(btn){
      btn.addEventListener('click',function(){
        fmtBtns.forEach(function(b){b.classList.remove('active')});
        btn.classList.add('active');
        chatFormat=btn.dataset.format;
      });
    });

    var chatInput=document.getElementById('chatInput');
    var chatSendBtn=document.getElementById('chatSend');

    chatSendBtn.addEventListener('click',sendChat);
    chatInput.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}
    });
  }

  function sendChat(){
    var chatInput=document.getElementById('chatInput');
    if(!chatInput)return;
    var text=chatInput.value.trim();
    if(!text)return;
    send({type:'chat',text:text,format:chatFormat});
    chatInput.value='';
    chatInput.style.height='auto';
  }

  function addChatMessage(msg){
    if(chatEmpty)chatEmpty.style.display='none';
    var div=document.createElement('div');

    if(msg.format==='code'){
      div.className='chat-msg-code';
      div.innerHTML='<div class="chat-msg-code-bar">'
        +'<div class="chat-msg-code-dots"><span></span><span></span><span></span></div>'
        +'<button class="chat-copy-btn" data-id="'+msg.id+'">Copy</button>'
        +'</div>'
        +'<div class="chat-msg-code-body"></div>';
      div.querySelector('.chat-msg-code-body').textContent=msg.text;
      div.querySelector('.chat-copy-btn').addEventListener('click',function(){
        var btn=this;
        navigator.clipboard.writeText(msg.text).then(function(){
          btn.textContent='Copied!';
          btn.classList.add('copied');
          setTimeout(function(){btn.textContent='Copy';btn.classList.remove('copied');},1500);
        });
      });
    }else{
      div.className='chat-msg';
      div.innerHTML='<div class="chat-msg-sender">Presenter</div><div class="chat-msg-text"></div>';
      div.querySelector('.chat-msg-text').textContent=msg.text;
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop=chatMessages.scrollHeight;
  }
})();
