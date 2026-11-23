const faq = [
['운동 기록 파일이 없어도 문의할 수 있나요?', '경로 이미지나 대회 코스 자료로 먼저 상담할 수 있으며, 제작에 필요한 자료를 추가로 안내합니다.'],
['메달도 제공되나요?', '고객이 보유한 메달을 전시하는 구성이며, 전달·장착 방법은 상담 시 안내합니다.'],
['캐릭터의 옷이나 색상을 변경할 수 있나요?', '원하는 참고 자료를 보내주시면 표현 가능 범위와 추가 비용을 확인해 안내합니다.'],
['가격과 제작 기간은 어떻게 되나요?', '크기, 구성, 색상, 후가공에 따라 달라지며 상담 후 개별 견적을 안내합니다.'],
['지형 모형만 제작할 수 있나요?', '지형 모형 단품으로도 제작 상담을 신청할 수 있습니다.']
];
document.querySelector('#questions').innerHTML = faq.map(([q,a])=>'<details><summary>'+q+'</summary><p>'+a+'</p></details>').join('');
const form = document.querySelector('form');
const contact = form.elements['연락처'];
contact.oninput=()=>contact.setCustomValidity('');
form.onsubmit=e=>{
 e.preventDefault();
 const value=contact.value.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&!/^\+?[\d\s()-]+$/.test(value) || (!value.includes('@') && !/^\d{7,15}$/.test(value.replace(/\D/g,'')))){
 contact.setCustomValidity('회신받을 이메일 주소 또는 전화번호를 확인해 주세요.'); contact.reportValidity();return;
 }
 const body=Array.from(new FormData(form)).filter(([,v])=>v.trim()).map(([k,v])=>k+' · '+v).join('\n')+'\n개인정보 수집·이용 동의';
 const mail='mailto:rladbstn8090@gmail.com?subject='+encodeURIComponent('MILESCULPT 맞춤 제작 상담')+'&body='+encodeURIComponent(body);
 const status=document.querySelector('#status');
 status.innerHTML='<p>메일 앱에서 내용을 확인하고 보내 주세요. 앱이 열리지 않으면 아래 내용을 복사해 rladbstn8090@gmail.com으로 보내 주세요.</p><textarea readonly aria-label="메일로 보낼 문의 내용"></textarea><a>메일 앱 다시 열기</a>';
 status.querySelector('textarea').value=body;status.querySelector('a').href=mail; location.href=mail;
};

const spec = new URLSearchParams(location.search);
const values = ['width','depth','height','km'].map(key=>spec.get(key));
if (values.every(value=>value!==null && /^\d{1,5}(\.\d{1,2})?$/.test(value))) {
  form.elements['관심 제품'].value='지형 모형';
  form.elements['문의 내용'].value='제작 스튜디오에서 만든 모형입니다. 크기 '+values.slice(0,3).join(' × ')+' mm, 코스 거리 '+values[3]+' km.';
}
