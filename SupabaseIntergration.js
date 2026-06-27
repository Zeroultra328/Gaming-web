// ============================================================
// NEXUS — Supabase Integration Layer
// ============================================================
// IMPORTANT: Replace these values with your actual credentials
// from Supabase Dashboard > Settings > API
// These are read from Vercel Environment Variables via a
// build step, OR you paste them directly here for static deploy.
// ============================================================

const SUPABASE_URL = window.__NEXUS_CONFIG__?.url || 'PASTE_YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = window.__NEXUS_CONFIG__?.key || 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';

// Load Supabase SDK dynamically
async function loadSupabase() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.onload = () => {
      const { createClient } = window.supabase;
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(client);
    };
    document.head.appendChild(script);
  });
}

// ============================================================
// AUTH MODULE
// ============================================================
class NexusAuth {
  constructor(client) { this.sb = client; }

  async signUp(email, password, username) {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: { data: { username, display_name: username } }
    });
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async getUser() {
    const { data: { user } } = await this.sb.auth.getUser();
    return user;
  }

  onAuthChange(callback) {
    return this.sb.auth.onAuthStateChange(callback);
  }
}

// ============================================================
// DATABASE MODULE
// ============================================================
class NexusDB {
  constructor(client) { this.sb = client; }

  async getLeaderboard(limit = 5) {
    const { data, error } = await this.sb
      .from('leaderboard')
      .select('*')
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async getProfile(userId) {
    const { data, error } = await this.sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  async updateProfile(userId, updates) {
    const { data, error } = await this.sb
      .from('profiles')
      .update(updates)
      .eq('id', userId);
    if (error) throw error;
    return data;
  }

  async getOnlineCount() {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count, error } = await this.sb
      .from('online_users')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', fiveMinAgo);
    if (error) return 0;
    return count || 0;
  }

  async updatePresence(userId, game = null) {
    const { error } = await this.sb.from('online_users').upsert({
      user_id: userId,
      last_seen: new Date().toISOString(),
      current_game: game
    });
    if (error) console.warn('Presence update failed:', error.message);
  }
}

// ============================================================
// STORAGE MODULE
// ============================================================
class NexusStorage {
  constructor(client) { this.sb = client; }

  async uploadAvatar(userId, file) {
    const ext = file.name.split('.').pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await this.sb.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = this.sb.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }
}

// ============================================================
// REALTIME MODULE
// ============================================================
class NexusRealtime {
  constructor(client) { this.sb = client; this.channel = null; }

  subscribeOnlineCount(callback) {
    this.channel = this.sb
      .channel('online-users-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'online_users'
      }, async () => {
        // Re-fetch count on any change
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count } = await this.sb
          .from('online_users')
          .select('*', { count: 'exact', head: true })
          .gte('last_seen', fiveMinAgo);
        callback(count || 0);
      })
      .subscribe();
  }

  subscribeLeaderboard(callback) {
    this.sb
      .channel('leaderboard-changes')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles'
      }, callback)
      .subscribe();
  }

  unsubscribeAll() {
    this.sb.removeAllChannels();
  }
}

// Export as global
window.NexusSupabase = { loadSupabase, NexusAuth, NexusDB, NexusStorage, NexusRealtime };
