/**
 * Sync - integração com Supabase para sincronização entre dispositivos.
 * Substitua SUPABASE_URL e SUPABASE_ANON_KEY com os valores do seu projeto.
 *
 * Estratégia:
 * - IndexedDB = fonte de verdade local (app funciona offline)
 * - Supabase   = espelho na nuvem (sync ao fazer login / ao salvar)
 * - Deduplicação por local_id (id do IndexedDB) nas fotos
 */
window.Sync = (function () {
  const SUPABASE_URL      = 'https://frjxcdqtfxntkoywvenq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyanhjZHF0ZnhudGtveXd2ZW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjEyNjcsImV4cCI6MjA5ODU5NzI2N30.GxTJii5zVsGf2fOxYKP7SBIWkoupFsdI-2xol8i3TUg';

  let _client = null;
  let _session = null;

  // ---------- Client Supabase (carregado via CDN no index.html) ----------

  function client() {
    if (!_client) {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _client;
  }

  // ---------- Auth ----------

  async function sendOTP(email) {
    const { error } = await client().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }

  async function verifyOTP(email, token) {
    const { data, error } = await client().auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;
    _session = data.session;
    return data.session;
  }

  async function signOut() {
    await client().auth.signOut();
    _session = null;
  }

  async function getSession() {
    if (_session) return _session;
    const { data } = await client().auth.getSession();
    _session = data.session;
    return _session;
  }

  function onAuthChange(callback) {
    client().auth.onAuthStateChange((_event, session) => {
      _session = session;
      callback(session);
    });
  }

  function isLoggedIn() { return !!_session; }
  function currentUser() { return _session?.user || null; }

  // ---------- Upload de foto ----------

  async function uploadPhoto(localPhoto) {
    const session = await getSession();
    if (!session) throw new Error('Não autenticado');
    const uid = session.user.id;

    let storagePath = null;

    // faz upload do blob se existir
    if (localPhoto.blob) {
      const ext = localPhoto.fileName?.split('.').pop() || 'jpg';
      storagePath = `${uid}/${localPhoto.id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await client().storage
        .from('photos')
        .upload(storagePath, localPhoto.blob, { upsert: true });
      if (uploadError) throw uploadError;
    }

    // salva metadados sem o blob
    const { blob: _b, objectUrl: _u, ...meta } = localPhoto;
    const { data, error } = await client()
      .from('photos')
      .upsert({
        local_id:     localPhoto.id,
        user_id:      uid,
        object_id:    localPhoto.objectId,
        storage_path: storagePath,
        data:         { ...meta, storagePath },
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'user_id,local_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ---------- Upload de objeto do catálogo ----------

  async function uploadObject(obj) {
    const session = await getSession();
    if (!session) throw new Error('Não autenticado');
    const { error } = await client()
      .from('objects')
      .upsert({ id: obj.id, user_id: session.user.id, data: obj, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  // ---------- Download / pull da nuvem ----------

  async function pullObjects() {
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client()
      .from('objects')
      .select('data')
      .eq('user_id', session.user.id);
    if (error) throw error;
    return (data || []).map(r => r.data);
  }

  async function pullPhotos() {
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client()
      .from('photos')
      .select('local_id, storage_path, data')
      .eq('user_id', session.user.id)
      .order('added_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getPhotoBlob(storagePath) {
    const { data, error } = await client().storage
      .from('photos')
      .download(storagePath);
    if (error) throw error;
    return data; // Blob
  }

  // ---------- Sync completo (pull → merge no IndexedDB local) ----------

  async function fullSync(onProgress) {
    const session = await getSession();
    if (!session) return { skipped: true };

    onProgress?.('Baixando catálogo...');
    const remoteObjects = await pullObjects();
    for (const obj of remoteObjects) {
      await window.DB.upsertObject(obj);
    }

    onProgress?.('Baixando sessões...');
    const remotePhotos = await pullPhotos();
    const localPhotos  = await window.DB.getAllPhotos();
    const localIds     = new Set(localPhotos.map(p => p.id));

    let newCount = 0;
    for (const rp of remotePhotos) {
      if (localIds.has(rp.local_id)) continue; // já existe local

      onProgress?.(`Baixando foto ${++newCount}...`);
      let blob = null;
      if (rp.storage_path) {
        try { blob = await getPhotoBlob(rp.storage_path); } catch (_) {}
      }
      await window.DB.addPhoto({ ...rp.data, blob, id: undefined }); // id novo gerado pelo DB local
    }

    return { objects: remoteObjects.length, newPhotos: newCount };
  }

  // ---------- Push de tudo que está local pra nuvem ----------

  async function pushAll(onProgress) {
    const session = await getSession();
    if (!session) return { skipped: true };

    const objects = await window.DB.getAllObjects();
    onProgress?.(`Enviando ${objects.length} objetos...`);
    for (const obj of objects) await uploadObject(obj);

    const photos = await window.DB.getAllPhotos();
    onProgress?.(`Enviando ${photos.length} fotos...`);
    let i = 0;
    for (const photo of photos) {
      onProgress?.(`Enviando foto ${++i}/${photos.length}...`);
      await uploadPhoto(photo);
    }

    return { objects: objects.length, photos: photos.length };
  }

  return {
    signInWithGoogle, signOut, getSession, onAuthChange, isLoggedIn, currentUser,
    uploadPhoto, uploadObject, pullObjects, pullPhotos, fullSync, pushAll,
  };
})();
