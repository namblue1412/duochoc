const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../share.js'), 'utf8');
const id = 'abcdefghijklmnopqrstuv';
const quiz = {meta: {title: 'Đề có ảnh'}, questions: [{id:'Q1', question:'?', options:['A','B'], correct:[0]}]};
function app(fetch, config = {supabaseUrl: 'https://test.supabase.co', publishableKey:'sb_publishable_test'}) {
  const context = {window:{QUIZ_SHARE_CONFIG:config}, location:new URL('https://example.com/duochoc/?old=1#quiz=old'), URL, TextEncoder, AbortController, setTimeout, clearTimeout, fetch};
  vm.runInNewContext(source, context);
  return context.window.QuizSharing;
}
test('bank links contain only a bank identifier', () => {
  assert.equal(app().link('bank','dd01'), 'https://example.com/duochoc/?bank=dd01');
});
test('uploaded quiz receives an opaque short link, preserving Unicode and images', async () => {
  const raw = {...quiz, image: 'data:image/png;base64,AAAA'};
  const service=app(async(url, options)=>{
    assert.equal(url,'https://test.supabase.co/rest/v1/rpc/create_quiz_share');
    assert.deepEqual(JSON.parse(options.body), {p_quiz:raw});
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    assert.equal(options.headers.Authorization, undefined);
    return {ok:true,json:async()=>id};
  });
  assert.equal(await service.upload(raw), `https://example.com/duochoc/?de=${id}`);
});
test('read calls only exact-ID function', async()=>{
  const service=app(async(url, options)=>{
    assert(url.endsWith('/read_quiz_share'));
    assert.deepEqual(JSON.parse(options.body),{p_id:id});
    return {ok:true,json:async()=>quiz};
  });
  assert.deepEqual(await service.read(id),quiz);
});
test('missing configuration gives an actionable error', async()=>{
  await assert.rejects(app(null,{}).upload(quiz), /chưa được kích hoạt/);
});
test('bad ID is rejected before any request', async()=>{
  await assert.rejects(app(()=>assert.fail('must not fetch')).read('../bad'), /không hợp lệ/);
});
test('missing or expired quiz is an explicit failure', async()=>{
  await assert.rejects(app(async()=>({ok:true,json:async()=>null})).read(id), /hết hạn/);
});
test('oversized quiz never uploads', async()=>{
  await assert.rejects(app(()=>assert.fail('must not fetch')).upload({text:'x'.repeat(4*1024*1024)}), /4 MB/);
});
test('failed service and bad responses never produce a fake link', async()=>{
  await assert.rejects(app(async()=>({ok:false,status:503})).upload(quiz), /Không kết nối/);
  await assert.rejects(app(async()=>({ok:true,json:async()=>({id})})).upload(quiz), /không hợp lệ/);
});
test('secret keys are rejected by client configuration', async()=>{
  await assert.rejects(app(null,{supabaseUrl:'https://test.supabase.co',publishableKey:'sb_secret_no'}).upload(quiz), /cấu hình đúng/);
});
