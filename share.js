/* Short quiz links: built-in bank references or opaque IDs in Supabase. */
window.QuizSharing = (() => {
  const MAX_BYTES = 4 * 1024 * 1024;
  const TOKEN = /^[A-Za-z0-9_-]{22}$/;
  function config() {
    const value = window.QUIZ_SHARE_CONFIG || {};
    if(!value.supabaseUrl || !value.publishableKey) {
      throw new Error('Chia sẻ đề tự nạp chưa được kích hoạt. Bạn có thể tải bộ đề thành file để gửi.');
    }
    const url = new URL(value.supabaseUrl);
    if(url.protocol !== 'https:' || url.username || url.password || !value.publishableKey.startsWith('sb_publishable_')) {
      throw new Error('Kết nối chia sẻ chưa được cấu hình đúng.');
    }
    return {url: url.origin, key: value.publishableKey};
  }
  async function rpc(name, body) {
    const {url, key} = config();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', signal: controller.signal,
        headers: {'Content-Type': 'application/json', apikey: key},
        body: JSON.stringify(body), credentials: 'omit', cache: 'no-store'
      });
      if(!response.ok) {
        if(response.status === 413) throw new Error('Bộ đề quá lớn để chia sẻ. Hãy giảm kích thước ảnh hoặc gửi file JSON.');
        throw new Error('Không kết nối được kho chia sẻ. Vui lòng thử lại sau.');
      }
      return await response.json();
    } catch(error) {
      if(error.name === 'AbortError') throw new Error('Kết nối quá lâu. Vui lòng kiểm tra Internet và thử lại.');
      if(error instanceof TypeError) throw new Error('Không kết nối được kho chia sẻ. Vui lòng kiểm tra Internet.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function link(key, value) {
    if(!['http:', 'https:'].includes(location.protocol)) throw new Error('Hãy mở bản web trực tuyến để tạo liên kết chia sẻ.');
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set(key, value);
    return url.href;
  }
  async function upload(quiz) {
    const body = JSON.stringify(quiz);
    if(new TextEncoder().encode(body).length > MAX_BYTES) throw new Error('Bộ đề vượt quá 4 MB. Hãy giảm kích thước ảnh hoặc gửi file JSON.');
    const id = await rpc('create_quiz_share', {p_quiz: quiz});
    if(typeof id !== 'string' || !TOKEN.test(id)) throw new Error('Kho chia sẻ trả về mã không hợp lệ.');
    return link('de', id);
  }
  async function read(id) {
    if(!TOKEN.test(id)) throw new Error('Mã chia sẻ không hợp lệ.');
    const quiz = await rpc('read_quiz_share', {p_id: id});
    if(!quiz) throw new Error('Liên kết không tồn tại hoặc đã hết hạn sau 30 ngày.');
    return quiz;
  }
  return {upload, read, link};
})();
