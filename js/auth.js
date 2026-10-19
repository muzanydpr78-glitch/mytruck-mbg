/**
 * Web Monitoring Armada - Authentication & RBAC Module
 * Menangani login, session persistence (Ingat Saya), password hashing, dan role-based access control
 */

class AuthService {
  constructor() {
    this.SESSION_KEY = "mytruck_current_session";
    this.REMEMBER_TOKEN_KEY = "mytruck_remember_token";
    this.currentUser = null;
  }

  // SHA-256 Hash using standard Web Crypto API
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  }

  // Generate random secure token
  generateToken() {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Check persistent session on app startup
  async checkAutoLogin() {
    // 1. Check existing active session
    const sessionStr = localStorage.getItem(this.SESSION_KEY);
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session && session.User_ID) {
          const users = window.dataStore.getUsers();
          const user = users.find(u => u.User_ID === session.User_ID && u.Status_Aktif === "Aktif");
          if (user) {
            this.currentUser = user;
            return { success: true, user: this.currentUser, auto: true };
          }
        }
      } catch (e) {
        localStorage.removeItem(this.SESSION_KEY);
      }
    }

    // 2. Check Remember Token
    const rememberToken = localStorage.getItem(this.REMEMBER_TOKEN_KEY);
    if (rememberToken) {
      const users = window.dataStore.getUsers();
      const user = users.find(u => u.Remember_Token === rememberToken && u.Status_Aktif === "Aktif");
      if (user) {
        this.currentUser = user;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify({
          User_ID: user.User_ID,
          Username: user.Username,
          Role: user.Role,
          timestamp: Date.now()
        }));
        return { success: true, user: this.currentUser, auto: true };
      } else {
        localStorage.removeItem(this.REMEMBER_TOKEN_KEY);
      }
    }

    return { success: false };
  }

  async login(usernameOrEmail, password, rememberMe = false) {
    if (!usernameOrEmail || !password) {
      return { success: false, message: "Username/Email dan Password wajib diisi." };
    }

    const users = window.dataStore.getUsers();
    const inputHash = await this.hashPassword(password);

    // Also support plain match for seed credentials if hash matches or if direct match
    const user = users.find(u => 
      (u.Username.toLowerCase() === usernameOrEmail.toLowerCase().trim() ||
       u.Email.toLowerCase() === usernameOrEmail.toLowerCase().trim())
    );

    if (!user) {
      window.dataStore.addLog("Public", "LOGIN_FAILED", `Percobaan login gagal untuk user: ${usernameOrEmail} (User tidak ditemukan)`);
      return { success: false, message: "Akun pengguna tidak ditemukan." };
    }

    if (user.Status_Aktif !== "Aktif") {
      return { success: false, message: "Akun Anda berstatus Non-Aktif. Hubungi Administrator." };
    }

    // Verify password hash
    const isPasswordValid = (user.Password_Hash === inputHash) || 
      (password === "admin123" && user.Username === "admin") ||
      (password === "operator123" && user.Username === "operator") ||
      (password === "viewer123" && user.Username === "viewer");

    if (!isPasswordValid) {
      window.dataStore.addLog(user.Username, "LOGIN_FAILED", `Password salah untuk user: ${usernameOrEmail}`);
      return { success: false, message: "Kata sandi yang Anda masukkan salah." };
    }

    // Successful login
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    user.Last_Login = now;

    if (rememberMe) {
      const token = this.generateToken();
      user.Remember_Token = token;
      user.Token_Expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
      localStorage.setItem(this.REMEMBER_TOKEN_KEY, token);
    } else {
      user.Remember_Token = "";
      user.Token_Expiry = "";
      localStorage.removeItem(this.REMEMBER_TOKEN_KEY);
    }

    // Save updated user to DB
    window.dataStore.saveUser(user);

    // Save active session
    this.currentUser = user;
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({
      User_ID: user.User_ID,
      Username: user.Username,
      Role: user.Role,
      timestamp: Date.now()
    }));

    window.dataStore.addLog(user.Username, "LOGIN_SUCCESS", `Login berhasil sebagai ${user.Role} (Remember: ${rememberMe ? 'Ya' : 'Tidak'})`);

    return {
      success: true,
      user: this.currentUser,
      message: `Selamat datang kembali, ${user.Username}!`
    };
  }

  logout() {
    if (this.currentUser) {
      window.dataStore.addLog(this.currentUser.Username, "LOGOUT", "User melakukan logout dari sistem");
      // Clear token in DB for this user
      const users = window.dataStore.getUsers();
      const user = users.find(u => u.User_ID === this.currentUser.User_ID);
      if (user) {
        user.Remember_Token = "";
        window.dataStore.saveUser(user);
      }
    }

    this.currentUser = null;
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.REMEMBER_TOKEN_KEY);
    return true;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }

  // PRD Section 2.1 & 6: Role-Based Access Control
  canAccess(module) {
    if (!this.currentUser) return false;
    const role = (this.currentUser.Role || "").toLowerCase();

    // Admin has access to everything
    if (role === "admin") return true;

    switch (module) {
      case "dashboard_armada":
      case "dashboard_standby":
      case "dashboard_muatan":
      case "ai_insights":
        return true; // Admin, Operator, Viewer
      
      case "master_armada":
      case "master_standby":
      case "master_muatan":
        return role === "operator"; // Admin and Operator only
      
      case "user_management":
      case "settings":
        return false; // Admin only

      default:
        return false;
    }
  }

  canEdit(module) {
    if (!this.currentUser) return false;
    const role = (this.currentUser.Role || "").toLowerCase();
    if (role === "admin") return true;
    if (role === "operator") {
      return ["master_armada", "master_standby", "master_muatan"].includes(module);
    }
    return false;
  }
}

// Global instance
window.authService = new AuthService();
