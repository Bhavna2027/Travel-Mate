// TravelMate Shared Layout and Navigation Controller

document.addEventListener('DOMContentLoaded', () => {
  injectNavbar();
  injectFooter();
  injectModals();
  highlightActiveLink();
  checkAuthAndPageAccess();
});

// 1. Inject Navbar
function injectNavbar() {
  const container = document.getElementById('navbar-container');
  if (!container) return;

  container.innerHTML = `
    <header class="navbar-wrapper">
      <div class="container navbar">
        <a href="index.html" class="nav-logo">
          <i class="fa-solid fa-compass"></i>
          <span>Travel<span>Mate</span></span>
        </a>
        <ul class="nav-links" id="nav-menu">
          <li><a href="index.html" id="link-home">Home</a></li>
          <li><a href="accommodation.html" id="link-accommodation">Accommodation</a></li>
          <li><a href="trips.html" id="link-trips">Trips</a></li>
          <li><a href="contact.html" id="link-contact">Contact Us</a></li>
          <li><a href="sos.html" id="link-sos" class="nav-sos"><i class="fa-solid fa-triangle-exclamation"></i> SOS / Safety</a></li>
        </ul>
        <div class="nav-auth" id="nav-auth-section">
          <!-- Populated dynamically -->
        </div>
        <button class="hamburger" id="hamburger-btn" onclick="toggleMobileMenu()">
          <i class="fa-solid fa-bars"></i>
        </button>
      </div>
    </header>
  `;
}

// 2. Inject Footer
function injectFooter() {
  const container = document.getElementById('footer-container');
  if (!container) return;

  container.innerHTML = `
    <footer class="footer-wrapper">
      <div class="container footer-grid">
        <div class="footer-info">
          <h3 style="color:#ffffff; font-size:22px; font-weight:700; margin-bottom:16px;">TravelMate</h3>
          <p>A trust-first group travel matching platform designed specifically for Indian women travelers. Explore, connect, and travel safely with verified companions.</p>
          <div class="footer-social">
            <a href="#"><i class="fa-brands fa-instagram"></i></a>
            <a href="#"><i class="fa-brands fa-facebook"></i></a>
            <a href="#"><i class="fa-brands fa-twitter"></i></a>
          </div>
        </div>
        <div class="footer-links">
          <h4>Platform</h4>
          <ul>
            <li><a href="index.html">Home</a></li>
            <li><a href="accommodation.html">Accommodation</a></li>
            <li><a href="trips.html">Trips Matching</a></li>
          </ul>
        </div>
        <div class="footer-links">
          <h4>Safety & Support</h4>
          <ul>
            <li><a href="sos.html">SOS Alerts</a></li>
            <li><a href="contact.html">Contact Us</a></li>
            <li><a href="contact.html#faq">FAQs</a></li>
          </ul>
        </div>
        <div class="footer-links">
          <h4>Contact Us</h4>
          <ul style="color:rgba(255,255,255,0.6); font-size:14px; display:flex; flex-direction:column; gap:12px;">
            <li>Email: support@travelmate.in</li>
            <li>Response: Under 2 hours</li>
            <li>Helpline: 24/7 Active</li>
          </ul>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>&copy; 2026 TravelMate Platform. Built with trust and care for Indian women travelers.</p>
      </div>
    </footer>
  `;
}

// 3. Inject Modals (Auth, Aadhaar, Biometrics)
function injectModals() {
  // Check if modals wrapper exists, otherwise create it
  let wrapper = document.getElementById('shared-modals-container');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'shared-modals-container';
    document.body.appendChild(wrapper);
  }

  wrapper.innerHTML = `
    <!-- General Auth Modal Overlay -->
    <div id="auth-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <button class="modal-close" onclick="closeAuthModal()">&times;</button>
        <div class="auth-tabs" style="display:flex; justify-content:space-around; margin-bottom:20px; border-bottom:1px solid rgba(45,58,140,0.1);">
          <button id="tab-login" class="btn" style="background:none; color:inherit; font-weight:600; cursor:pointer;" onclick="switchAuthTab('login')">Login</button>
          <button id="tab-register" class="btn" style="background:none; color:inherit; font-weight:600; cursor:pointer;" onclick="switchAuthTab('register')">Sign Up</button>
        </div>
        
        <!-- Login Form -->
        <form id="form-login" class="auth-form" onsubmit="handleLogin(event)">
          <h2 style="font-size:24px; text-align:center; margin-bottom:8px;">Welcome Back</h2>
          <p class="text-center" style="font-size:13px; color:var(--text-secondary); margin-bottom:24px;">Connect with compatible, verified travel partners.</p>
          
          <div class="form-group">
            <label style="font-weight:600; font-size:14px; margin-bottom:6px; display:block;">Email Address</label>
            <input type="email" id="login-email" required placeholder="name@domain.com">
          </div>
          
          <div class="form-group">
            <label style="font-weight:600; font-size:14px; margin-bottom:6px; display:block;">Password</label>
            <input type="password" id="login-password" required placeholder="Enter password">
          </div>
          
          <button type="submit" class="btn btn-primary btn-block" style="margin-top:20px;">Log In <i class="fa-solid fa-chevron-right"></i></button>
        </form>

        <!-- Register Form -->
        <form id="form-register" class="auth-form hidden" onsubmit="handleRegister(event)">
          <h2 style="font-size:24px; text-align:center; margin-bottom:8px;">Create Account</h2>
          <p class="text-center" style="font-size:13px; color:var(--text-secondary); margin-bottom:24px;">Enter your details to register as a verified companion.</p>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group" style="grid-column: span 2;">
              <label>Full Name</label>
              <input type="text" id="reg-name" required placeholder="Name">
            </div>
            
            <div class="form-group">
              <label>Phone Number</label>
              <input type="text" id="reg-phone" required pattern="^[0-9]{10}$" placeholder="10-digit number">
            </div>
            
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="reg-email" required placeholder="Email">
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label>Password</label>
              <input type="password" id="reg-password" required minlength="8" placeholder="Password (Min 8 chars)">
            </div>

            <div class="form-group">
              <label>Age</label>
              <input type="number" id="reg-age" required min="18" max="100" placeholder="Age">
            </div>

            <div class="form-group">
              <label>Gender</label>
              <select id="reg-gender" required>
                <option value="F" selected>Female</option>
                <option value="M">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label>Gender Preference</label>
              <select id="reg-gender-pref" required>
                <option value="women-only" selected>Women-Only Groups</option>
                <option value="mixed">Mixed Groups</option>
              </select>
            </div>
          </div>
          
          <button type="submit" class="btn btn-primary btn-block" style="margin-top:20px;">Sign Up & Send OTP <i class="fa-solid fa-paper-plane"></i></button>
        </form>

        <!-- OTP Verification Form -->
        <form id="form-otp" class="auth-form hidden" onsubmit="handleVerifyOtp(event)">
          <h2 style="font-size:24px; text-align:center; margin-bottom:8px;">Verify Identity</h2>
          <p id="otp-phone-text" class="text-center" style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">We have sent a verification code.</p>
          
          <div class="form-group" style="background-color:rgba(45, 58, 140, 0.05); padding:12px; border-radius:8px; font-size:12px; color:var(--primary-color); margin-bottom:16px;">
            <i class="fa-solid fa-circle-exclamation"></i>
            <span><strong>Mock Gateway Active:</strong> For testing local developer setups, check the server console to view your generated code.</span>
          </div>

          <input type="hidden" id="otp-phone">

          <div class="form-group">
            <label style="text-align:center; display:block;">Enter 6-Digit OTP</label>
            <input type="text" id="otp-code" style="text-align:center; letter-spacing:4px; font-size:18px;" required pattern="^[0-9]{6}$" placeholder="000000">
          </div>
          
          <button type="submit" class="btn btn-primary btn-block" style="margin-top:20px;">Verify OTP & Activate Profile <i class="fa-solid fa-check"></i></button>
          <button type="button" class="btn btn-secondary btn-block" style="margin-top:8px;" onclick="switchAuthTab('register')">Back</button>
        </form>
      </div>
    </div>

    <!-- Aadhaar Verification Modal -->
    <div id="aadhaar-verification-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <button class="modal-close" onclick="closeAadhaarModal()">&times;</button>
        <h3 style="font-size:20px; color:var(--primary-color); margin-bottom:12px; font-weight:700;"><i class="fa-solid fa-address-card"></i> Aadhaar Identity Verification (KYC)</h3>
        
        <!-- Step 1: Input Aadhaar Number -->
        <div id="aadhaar-step-1">
          <p class="text-secondary" style="font-size: 13px; line-height: 1.5; margin-bottom:16px;">
            Enter your 12-digit Aadhaar number. A verification OTP code will be sent to your registered Email and WhatsApp phone number.
          </p>
          <div class="form-group">
            <label>Aadhaar Number</label>
            <input type="text" id="aadhaar-number-input" placeholder="Enter 12-digit Aadhaar" maxlength="12">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:24px;">
            <button class="btn btn-secondary btn-sm" onclick="closeAadhaarModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="handleSendAadhaarOtp()"><i class="fa-solid fa-paper-plane"></i> Send OTP</button>
          </div>
        </div>

        <!-- Step 2: Input OTP -->
        <div id="aadhaar-step-2" class="hidden">
          <p class="text-secondary" style="font-size: 13px; line-height: 1.5; margin-bottom:12px;">
            A 6-digit code has been dispatched. Enter it below to complete identity verification.
          </p>
          <div id="aadhaar-masked-info" style="font-size:12px; color:var(--text-secondary); margin-bottom:16px;"></div>
          <div class="form-group">
            <label>Enter 6-digit OTP</label>
            <input type="text" id="aadhaar-otp-input" placeholder="000000" maxlength="6" style="text-align:center; letter-spacing:4px; font-size:18px;">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:24px;">
            <button class="btn btn-secondary btn-sm" onclick="goBackToAadhaarStep1()">Back</button>
            <button class="btn btn-primary btn-sm" style="background-color:var(--success-color);" onclick="handleConfirmAadhaarOtp()"><i class="fa-solid fa-circle-check"></i> Verify & Confirm</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Biometric Face Authentication Gate Modal -->
    <div id="face-auth-modal" class="modal-overlay hidden">
      <div class="modal-card" style="max-width: 400px; text-align: center;">
        <h3 style="font-size:20px; color:var(--primary-color); margin-bottom:12px; font-weight:700;"><i class="fa-solid fa-face-viewfinder"></i> Biometric Face Scan</h3>
        <p class="text-secondary" style="font-size: 13px; margin-bottom:16px;">
          Position your face in the center ring. Hold still to run biometric liveness verification.
        </p>
        
        <div class="webcam-container" style="position:relative; width:100%; height:240px; background-color:#1a1a2e; border-radius:12px; overflow:hidden; margin-bottom:16px;">
          <video id="webcam-stream" style="width:100%; height:100%; object-fit:cover; transform:scaleX(-1);" autoplay playsinline></video>
          <div class="biometric-scanner-line" style="position:absolute; top:0; left:0; width:100%; height:2px; background-color:var(--accent-color); box-shadow:0 0 10px var(--accent-color); animation:scan-anim 2s infinite ease-in-out;"></div>
          <div class="biometric-target-box" style="position:absolute; top:50%; left:50%; width:160px; height:160px; transform:translate(-50%, -50%); border:3px dashed rgba(255,255,255,0.6); border-radius:50%;"></div>
          
          <div id="biometric-loading-overlay" class="hidden" style="position:absolute; top:0; left:0; right:0; bottom:0; background-color:rgba(26,26,46,0.8); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#ffffff;">
            <div class="sim-spinner" style="width:40px; height:40px; border:4px solid rgba(255,255,255,0.2); border-left-color:#ffffff; border-radius:50%; animation:spin 1s infinite linear; margin-bottom:12px;"></div>
            <div id="biometric-status-title" style="font-weight:700; font-size:14px;">Scanning...</div>
            <div id="biometric-status-desc" style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px;">Initiating camera interface</div>
          </div>
        </div>

        <div id="liveness-challenge-card" style="background-color:rgba(45,58,140,0.05); padding:10px; border-radius:8px; font-size:12px; color:var(--primary-color); margin-bottom:16px;">
          <i class="fa-solid fa-circle-info"></i> <span id="liveness-instruction">Connecting to camera...</span>
        </div>

        <button class="btn btn-secondary btn-sm" onclick="closeFaceAuthModal()">Cancel Scan</button>
      </div>
    </div>
  `;
}

// 4. Highlight Active Link
function highlightActiveLink() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';
  
  const linkIdMap = {
    'index.html': 'link-home',
    'accommodation.html': 'link-accommodation',
    'trips.html': 'link-trips',
    'contact.html': 'link-contact',
    'sos.html': 'link-sos'
  };

  const activeLinkId = linkIdMap[page];
  if (activeLinkId) {
    const activeLink = document.getElementById(activeLinkId);
    if (activeLink) activeLink.classList.add('active');
  }
}

// 5. Check Auth state and Dynamic Navbar Render
function checkAuthAndPageAccess() {
  const token = localStorage.getItem('tm_access_token');
  const authSection = document.getElementById('nav-auth-section');

  if (authSection) {
    if (token) {
      // Retrieve user's name from localStorage cache
      const cachedName = localStorage.getItem('tm_user_name') || 'Traveler';
      authSection.innerHTML = `
        <div class="nav-user">
          <i class="fa-solid fa-circle-user"></i>
          <span id="nav-user-name">${cachedName}</span>
          <button class="btn btn-secondary btn-sm" onclick="handleNavbarLogout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
        </div>
      `;
    } else {
      authSection.innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="openAuthModal('login')">Login</button>
        <button class="btn btn-primary btn-sm" onclick="openAuthModal('register')">Sign Up</button>
      `;
    }
  }

  // Route protection
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';

  if (!token && (page === 'trips.html' || page === 'sos.html')) {
    // Show access restriction screen
    const mainSection = document.querySelector('main');
    if (mainSection) {
      mainSection.innerHTML = `
        <div class="container text-center" style="padding:100px 24px;">
          <div class="empty-state">
            <i class="fa-solid fa-lock" style="font-size:64px; color:var(--accent-color); margin-bottom:24px;"></i>
            <h2 style="font-size:32px; margin-bottom:12px;">Authentication Required</h2>
            <p style="font-size:16px; color:var(--text-secondary); margin-bottom:32px; max-width:500px; margin-left:auto; margin-right:auto;">
              Trips Matching and SOS Safety panels are private areas exclusive to the TravelMate community. Please sign in or create a verified account to gain access.
            </p>
            <div style="display:flex; justify-content:center; gap:16px;">
              <button class="btn btn-primary" onclick="openAuthModal('login')">Log In Now</button>
              <button class="btn btn-secondary" onclick="openAuthModal('register')">Create Account</button>
            </div>
          </div>
        </div>
      `;
    }
  }
}

// 6. Hamburger mobile menu toggle
function toggleMobileMenu() {
  const menu = document.getElementById('nav-menu');
  const auth = document.getElementById('nav-auth-section');
  if (menu && auth) {
    const isHidden = menu.style.display === 'none' || menu.style.display === '';
    menu.style.display = isHidden ? 'flex' : 'none';
    auth.style.display = isHidden ? 'flex' : 'none';
    
    // Toggle layout classes
    if (isHidden) {
      menu.style.flexDirection = 'column';
      menu.style.position = 'absolute';
      menu.style.top = '80px';
      menu.style.left = '0';
      menu.style.right = '0';
      menu.style.backgroundColor = '#ffffff';
      menu.style.padding = '20px';
      menu.style.borderBottom = '1px solid var(--card-border)';
      menu.style.gap = '16px';
      
      auth.style.flexDirection = 'row';
      auth.style.position = 'absolute';
      auth.style.top = '300px';
      auth.style.left = '0';
      auth.style.right = '0';
      auth.style.backgroundColor = '#ffffff';
      auth.style.padding = '20px';
      auth.style.justifyContent = 'center';
      auth.style.borderBottom = '1px solid var(--card-border)';
    } else {
      menu.removeAttribute('style');
      auth.removeAttribute('style');
    }
  }
}

// 7. Modal Controls
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('hidden');
    switchAuthTab(tab);
  }
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function switchAuthTab(tab) {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formOtp = document.getElementById('form-otp');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  if (formOtp) formOtp.classList.add('hidden');

  if (tab === 'login') {
    if (formLogin) formLogin.classList.remove('hidden');
    if (formRegister) formRegister.classList.add('hidden');
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
  } else {
    if (formLogin) formLogin.classList.add('hidden');
    if (formRegister) formRegister.classList.remove('hidden');
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.add('active');
  }
}

// Aadhaar helper calls mapped to modal context
function closeAadhaarModal() {
  const modal = document.getElementById('aadhaar-verification-modal');
  if (modal) modal.classList.add('hidden');
}

function goBackToAadhaarStep1() {
  const step1 = document.getElementById('aadhaar-step-1');
  const step2 = document.getElementById('aadhaar-step-2');
  if (step1) step1.classList.remove('hidden');
  if (step2) step2.classList.add('hidden');
}

function closeFaceAuthModal() {
  const modal = document.getElementById('face-auth-modal');
  if (modal) modal.classList.add('hidden');
  // Handle stopping camera streams
  const video = document.getElementById('webcam-stream');
  if (video && video.srcObject) {
    const stream = video.srcObject;
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    video.srcObject = null;
  }
}

// Logout Handler
async function handleNavbarLogout() {
  const refreshToken = localStorage.getItem('tm_refresh_token');
  if (refreshToken) {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
    } catch (err) {
      console.error('Logout API call failed:', err);
    }
  }
  
  // Clear local credentials
  localStorage.removeItem('tm_access_token');
  localStorage.removeItem('tm_refresh_token');
  localStorage.removeItem('tm_user_name');
  window.location.href = 'index.html';
}

// CSS scan animation keyframes injection
(function() {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes scan-anim {
      0% { top: 0; }
      50% { top: 100%; }
      100% { top: 0; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .auth-tabs button.active {
      border-bottom: 3px solid var(--primary-color) !important;
      color: var(--primary-color) !important;
    }
    .auth-tabs button {
      border-bottom: 3px solid transparent !important;
      padding: 10px 20px;
    }
  `;
  document.head.appendChild(style);
})();
