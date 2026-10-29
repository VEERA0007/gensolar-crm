/* GenSolar web shim.
   The Android app talks to Firebase through native bridges (GenSolarAuth, GenSolarLeads,
   GenSolarAdmin, GenSolarNative). This file provides the same bridges in a browser using the
   Firebase web SDK, so the same index.html runs on the web. Behaviour mirrors MainActivity.java. */
(function(){
  'use strict';
  var cfg=window.GENSOLAR_FIREBASE;
  if(!window.firebase||!cfg){console.error('Firebase SDK or config missing');return}
  firebase.initializeApp(cfg);
  var auth=firebase.auth(),db=firebase.firestore();
  try{auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)}catch(e){}

  function call(name){var a=Array.prototype.slice.call(arguments,1),fn=window[name];if(typeof fn==='function')fn.apply(null,a)}
  function jsError(m){call('onGenSolarAuthError',m||'Authentication failed. Please try again.')}
  function adminError(m){call('onGenSolarAdminError',m)}
  function leadError(m){call('onGenSolarCloudError',m)}
  function now(){return Date.now()}
  function str(v){return v==null?'':String(v)}
  function field(doc,k){var d=doc&&doc.exists?doc.data():null;return d&&d[k]!=null?d[k]:null}
  var VALID_ROLES=/^(admin|sales_head|regional_manager|sales_manager|sales_rep|channel_partner|customer)$/;

  /* ---------- sign-in ---------- */
  var verifier=null,confirmation=null,signingIn=false;
  function resetVerifier(){
    try{if(verifier)verifier.clear()}catch(e){}
    verifier=null;
    var old=document.getElementById('gs-recaptcha');if(old)old.remove();
  }
  function makeVerifier(){
    resetVerifier();
    var div=document.createElement('div');div.id='gs-recaptcha';document.body.appendChild(div);
    verifier=new firebase.auth.RecaptchaVerifier(div,{size:'invisible'});
    return verifier;
  }
  function authSuccess(user,role,requested,name,email){
    call('onGenSolarAuthSuccess',user.uid,role,user.phoneNumber||'',requested||'',name||'',email||'');
  }
  function proceedProfile(user,doc,ref){
    if(doc.exists){
      var role=field(doc,'role')||'customer';
      authSuccess(user,role,field(doc,'requestedRole'),field(doc,'displayName'),field(doc,'email'));
    }else{
      ref.set({uid:user.uid,phone:user.phoneNumber||'',role:'customer',createdAt:now()},{merge:true})
        .then(function(){authSuccess(user,'customer','','','')})
        .catch(function(e){jsError('Signed in, but profile setup failed: '+e.message)});
    }
  }
  function applyInvite(user,doc,ref,inv){
    var role=field(inv,'role'),designation=field(inv,'designation'),name=field(inv,'name');
    var data={uid:user.uid,phone:user.phoneNumber||'',role:role,organizationId:field(inv,'organizationId')||''};
    if(designation!=null)data.requestedRole=designation;
    var existing=field(doc,'displayName');
    var shown=existing?existing:(name||'');
    if(shown)data.displayName=shown;
    if(!doc.exists)data.createdAt=now();
    data.approvedAt=now();
    ref.set(data,{merge:true}).then(function(){
      inv.ref.delete();
      authSuccess(user,role,designation,shown,doc.exists?(field(doc,'email')||''):'');
    }).catch(function(){proceedProfile(user,doc,ref)});
  }
  function ensureCustomerProfile(user){
    var ref=db.collection('users').doc(user.uid);
    ref.get().then(function(doc){
      var role=field(doc,'role')||'customer',phone=user.phoneNumber;
      if(role==='customer'&&phone){
        db.collection('invites').doc(phone).get().then(function(inv){
          if(inv.exists&&field(inv,'role'))applyInvite(user,doc,ref,inv);else proceedProfile(user,doc,ref);
        }).catch(function(){proceedProfile(user,doc,ref)});
      }else proceedProfile(user,doc,ref);
    }).catch(function(e){jsError('Could not load account role. Check Firestore rules: '+e.message)});
  }

  window.GenSolarAuth={
    sendOtp:function(phone){
      try{
        var digits=str(phone).replace(/\D/g,'');
        if(!/^[6-9][0-9]{9}$/.test(digits)){jsError('Enter a valid 10-digit Indian mobile number.');return}
        auth.signInWithPhoneNumber('+91'+digits,makeVerifier()).then(function(c){
          confirmation=c;call('onGenSolarOtpSent');
        }).catch(function(e){resetVerifier();jsError(e&&e.message?e.message:'Could not send OTP. Check Firebase phone auth settings.')});
      }catch(t){resetVerifier();jsError('Could not start OTP: '+t)}
    },
    verifyOtp:function(code){
      if(!confirmation){jsError('Request an OTP first.');return}
      var otp=str(code).trim();
      if(!/^[0-9]{6}$/.test(otp)){jsError('Enter the 6-digit OTP.');return}
      signingIn=true;
      confirmation.confirm(otp).then(function(r){
        signingIn=false;ensureCustomerProfile(r.user);
      }).catch(function(e){signingIn=false;jsError(e&&e.message?e.message:'OTP verification failed.')});
    },
    signOut:function(){auth.signOut()},
    saveProfile:function(name,email){
      var u=auth.currentUser;if(!u)return;
      db.collection('users').doc(u.uid).set({displayName:str(name).slice(0,80),email:str(email).slice(0,120)},{merge:true})
        .catch(function(e){console.error('Could not save profile',e)});
    },
    saveDesignation:function(key){
      var u=auth.currentUser;if(!u||!key||!VALID_ROLES.test(key))return;
      db.collection('users').doc(u.uid).set({requestedRole:key,requestedAt:now()},{merge:true})
        .catch(function(e){console.error('Could not save requested role',e)});
    }
  };

  /* Restore the session on page load, as the Android app does. */
  var first=true;
  auth.onAuthStateChanged(function(user){
    if(!first)return;first=false;
    if(user&&!signingIn)ensureCustomerProfile(user);
  });

  /* ---------- team admin ---------- */
  function mapRole(d){
    if(d==='sales_rep'||d==='channel_partner')return 'rep';
    if(d==='sales_head'||d==='regional_manager'||d==='sales_manager')return 'manager';
    return null;
  }
  function myProfile(){var u=auth.currentUser;return u?db.collection('users').doc(u.uid).get():Promise.reject(new Error('Sign in first.'))}
  window.GenSolarAdmin={
    addMember:function(name,phone10,designation){
      var me=auth.currentUser;if(!me){adminError('Sign in first.');return}
      var role=mapRole(designation),digits=str(phone10).replace(/\D/g,'');
      if(!role||!/^[6-9][0-9]{9}$/.test(digits)||!name||!String(name).trim()){adminError('Check the name, mobile number and role.');return}
      var phone='+91'+digits,clean=String(name).trim().slice(0,80);
      myProfile().then(function(p){
        var org=field(p,'organizationId');
        if(field(p,'role')!=='admin'||!org){adminError('Only an admin with an organizationId can add members.');return}
        db.collection('invites').doc(phone).set({name:clean,phone:phone,designation:designation,role:role,organizationId:org,createdBy:me.uid,createdAt:now()})
          .then(function(){call('onGenSolarMemberChanged',clean+' added. They get access when they sign in with '+phone+'.')})
          .catch(function(e){adminError('Could not add member. Publish the latest firestore.rules. '+e.message)});
      }).catch(function(){adminError('Could not load your profile.')});
    },
    removeInvite:function(phone){
      if(!phone||!/^\+91[6-9][0-9]{9}$/.test(phone))return;
      db.collection('invites').doc(phone).delete()
        .then(function(){call('onGenSolarMemberChanged','Removed')})
        .catch(function(e){adminError('Could not remove. '+e.message)});
    },
    loadMembers:function(){
      if(!auth.currentUser)return;
      myProfile().then(function(p){
        var org=field(p,'organizationId');
        if(field(p,'role')!=='admin'||!org)return;
        db.collection('users').where('organizationId','==',org).get().then(function(us){
          var members=us.docs.map(function(d){var x=d.data();return {uid:d.id,name:x.displayName||'',phone:x.phone||'',role:x.role||'customer',requestedRole:x.requestedRole||''}});
          db.collection('invites').where('organizationId','==',org).get().then(function(is){
            var invites=is.docs.map(function(d){var x=d.data();return {name:x.name||'',phone:d.id,designation:x.designation||''}});
            call('onGenSolarMembers',members,invites);
          }).catch(function(){adminError('Could not load invited members. Publish the latest firestore.rules.')});
        }).catch(function(){adminError('Could not load members. Publish the latest firestore.rules.')});
      }).catch(function(){});
    },
    loadRequests:function(){
      if(!auth.currentUser){adminError('Sign in first.');return}
      myProfile().then(function(p){
        var role=field(p,'role'),org=field(p,'organizationId');
        if(role!=='admin'){adminError('Only admins can use the Team page.');return}
        if(!org){adminError('Add an organizationId to your own account in Firebase first.');return}
        var wanted=['admin','sales_head','regional_manager','sales_manager','sales_rep','channel_partner'];
        db.collection('users').where('requestedRole','in',wanted).get().then(function(snap){
          var rows=snap.docs.map(function(d){var x=d.data();return {uid:d.id,phone:x.phone||'',role:x.role||'customer',requestedRole:x.requestedRole,name:x.displayName||'',requestedAt:x.requestedAt||0,organizationId:x.organizationId||''}});
          call('onGenSolarRequests',rows,role);
        }).catch(function(e){adminError('Could not load requests. Publish the latest firestore.rules. '+e.message)});
      }).catch(function(){adminError('Could not load your profile.')});
    },
    decide:function(uid,newRole,approve){
      var me=auth.currentUser;if(!me||!uid){adminError('Sign in first.');return}
      if(approve&&!(newRole==='rep'||newRole==='manager')){adminError('That role must be assigned in the Firebase console.');return}
      myProfile().then(function(p){
        var org=field(p,'organizationId');
        if(!org){adminError('Your account needs an organizationId.');return}
        var data=approve?{role:newRole,organizationId:org,approvedBy:me.uid,approvedAt:now()}:{requestedRole:'customer'};
        db.collection('users').doc(uid).update(data)
          .then(function(){call('onGenSolarAdminDone',uid,!!approve)})
          .catch(function(e){adminError('Could not save. Only an admin can grant manager access. '+e.message)});
      }).catch(function(){adminError('Could not load your profile.')});
    }
  };

  /* ---------- cloud leads ---------- */
  function plain(v){
    if(v&&typeof v.toMillis==='function')return v.toMillis();
    if(Array.isArray(v))return v.map(plain);
    if(v&&typeof v==='object'){var o={};Object.keys(v).forEach(function(k){o[k]=plain(v[k])});return o}
    return v;
  }
  var LEAD_FIELDS=['name','phone','seg','state','city','kw','net','payback','source','quote','status','ts','notes','dealer','nextFollow','owner'];
  window.GenSolarLeads={
    loadLeads:function(){
      var u=auth.currentUser;if(!u){leadError('Sign in before loading cloud leads.');return}
      myProfile().then(function(p){
        var role=field(p,'role')||'customer',q=db.collection('leads');
        if(role==='manager'||role==='admin'){
          var org=field(p,'organizationId');
          if(!org){leadError('Your manager account needs an organization ID.');return}
          q=q.where('organizationId','==',org);
        }else if(role==='rep'||role==='representative')q=q.where('assignedRepUid','==',u.uid);
        else q=q.where('ownerUid','==',u.uid);
        q.get().then(function(s){
          call('onGenSolarCloudLeads',s.docs.map(function(d){var row=plain(d.data());row.id=d.id;return row}));
        }).catch(function(){leadError('Cloud leads could not load. Check the Firestore rules and internet connection.')});
      }).catch(function(){leadError('Your account profile could not be loaded.')});
    },
    saveLead:function(json){
      var u=auth.currentUser;if(!u){leadError('Sign in before saving cloud leads.');return}
      var src;try{src=JSON.parse(json||'{}')}catch(e){leadError('This lead could not be read.');return}
      myProfile().then(function(p){
        var role=field(p,'role')||'customer',org=field(p,'organizationId')||'';
        var company=(role==='manager'||role==='admin'||role==='rep'||role==='representative');
        if(company&&!org){leadError('Your company account needs an organization ID before cloud leads can sync.');return}
        var id=src.id||('L'+now()+Math.floor(Math.random()*100000).toString(36));
        var data={};
        LEAD_FIELDS.forEach(function(k){
          if(src[k]==null)return;var v=src[k];
          if(k==='notes'&&Array.isArray(v))data.notes=v.filter(function(n){return n&&typeof n==='object'}).map(function(n){return {ts:Number(n.ts)||now(),text:str(n.text)}});
          else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')data[k]=v;
        });
        data.id=id;data.updatedAt=now();
        if(src.createdAt==null)data.createdAt=now();
        if(role==='manager'||role==='admin'){
          data.organizationId=org;data.ownerUid=src.ownerUid||u.uid;
          if(src.assignedRepUid!=null)data.assignedRepUid=str(src.assignedRepUid);
        }else if(role==='rep'||role==='representative'){
          data.organizationId=org;data.assignedRepUid=u.uid;data.ownerUid=src.ownerUid||u.uid;
        }else{
          data.ownerUid=u.uid;data.customerUid=u.uid;data.organizationId='';data.assignedRepUid='';
        }
        db.collection('leads').doc(id).set(data,{merge:true})
          .then(function(){call('onGenSolarCloudLeadSaved',id)})
          .catch(function(){leadError('Lead is saved on this device, but cloud sync failed. Check Firestore rules.')});
      }).catch(function(){leadError('Your account profile could not be loaded.')});
    },
    deleteLead:function(id){
      if(!auth.currentUser||!id){leadError('Sign in before deleting a cloud lead.');return}
      db.collection('leads').doc(id).delete()
        .then(function(){call('onGenSolarCloudLeadDeleted',id)})
        .catch(function(){leadError('Cloud deletion failed. The record may still be stored on this device.')});
    }
  };

  /* ---------- device features ---------- */
  function tinyToast(t){
    var e=document.createElement('div');e.textContent=t;
    e.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#12202C;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px system-ui;z-index:9000;max-width:90%;text-align:center';
    document.body.appendChild(e);setTimeout(function(){e.remove()},2600);
  }
  window.GenSolarNative={
    appVersion:function(){return window.GENSOLAR_WEB_VERSION||''},
    shareText:function(text){
      if(navigator.share){navigator.share({text:text}).catch(function(){});return}
      try{navigator.clipboard.writeText(text).then(function(){tinyToast('Copied to clipboard')},function(){tinyToast('Could not copy')})}
      catch(e){tinyToast('Sharing is not available in this browser')}
    },
    openUrl:function(url){window.open(url,'_blank','noopener')},
    printPdf:function(){window.print()}
  };
})();
