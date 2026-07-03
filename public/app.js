// TravelMate Frontend JS Controller

let accessToken = localStorage.getItem('tm_access_token') || '';
let refreshToken = localStorage.getItem('tm_refresh_token') || '';
let activeUser = null;
let activeGroupId = '';
let activeItineraryId = '';
let activeItineraryVersion = 1;
let chatSocket = null;

// Base API URL (relative since we run on the same port)
const API_BASE = '';

// On Load check
document.addEventListener('DOMContentLoaded', () => {
  if (accessToken) {
    showDashboard();
  } else {
    showAuth();
  }
  const itinView = document.getElementById('itinerary-view');
  if (itinView) {
    loadItineraryTemplate('Manali');
  }
  const simQuiz = document.getElementById('sim-phone-frame');
  if (simQuiz) {
    initMatchingSimulator();
  }
});

// Toast Utility
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msgText = document.getElementById('toast-message');

  toast.className = `toast ${type}`;
  msgText.innerText = message;

  if (type === 'success') {
    icon.className = 'fa-solid fa-circle-check';
  } else if (type === 'error') {
    icon.className = 'fa-solid fa-circle-xmark';
  } else {
    icon.className = 'fa-solid fa-circle-info';
  }

  toast.classList.remove('hidden');
  
  // Auto dismiss toast after 4 seconds
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

// Switching tabs
function switchAuthTab(tab) {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formOtp = document.getElementById('form-otp');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  formOtp.classList.add('hidden');

  if (tab === 'login') {
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

// Show/Hide Dashboard panels
function showDashboard() {
  const authSec = document.getElementById('auth-section');
  if (authSec) authSec.classList.add('hidden');

  const dashSec = document.getElementById('dashboard-section');
  if (dashSec) dashSec.classList.remove('hidden');

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.classList.remove('hidden');

  const headerUser = document.getElementById('header-user-name');
  if (headerUser) headerUser.classList.remove('hidden');

  fetchUserProfile();
  fetchTrips();
  fetchMarketplaceGuides();
  fetchAdminLogs();
}

function showAuth() {
  const authSec = document.getElementById('auth-section');
  if (authSec) authSec.classList.remove('hidden');

  const dashSec = document.getElementById('dashboard-section');
  if (dashSec) dashSec.classList.add('hidden');

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.classList.add('hidden');

  const headerUser = document.getElementById('header-user-name');
  if (headerUser) headerUser.classList.add('hidden');

  switchAuthTab('login');
  
  // Close WebSocket if open
  if (chatSocket) {
    chatSocket.close();
    chatSocket = null;
  }
}

// Unified API Wrapper with Auto Token Refresh
async function apiFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (accessToken) {
    options.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (options.body && !(options.body instanceof URLSearchParams)) {
    options.headers['Content-Type'] = 'application/json';
  }

  let response = await fetch(url, options);

  // If unauthorized, attempt token refresh
  if (response.status === 401 && refreshToken) {
    console.log('[API] Access token expired, attempting refresh...');
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      localStorage.setItem('tm_access_token', accessToken);
      localStorage.setItem('tm_refresh_token', refreshToken);

      // Retry original request with new token
      options.headers['Authorization'] = `Bearer ${accessToken}`;
      response = await fetch(url, options);
    } else {
      // Refresh token failed/expired
      console.warn('[API] Session expired. Logging out.');
      handleLocalLogout();
    }
  }

  return response;
}

function handleLocalLogout() {
  accessToken = '';
  refreshToken = '';
  localStorage.removeItem('tm_access_token');
  localStorage.removeItem('tm_refresh_token');
  showAuth();
}

// AUTH HANDLERS
async function handleRegister(e) {
  e.preventDefault();
  const phone = document.getElementById('reg-phone').value;
  const email = document.getElementById('reg-email').value;
  const name = document.getElementById('reg-name').value;
  const password = document.getElementById('reg-password').value;
  const age = document.getElementById('reg-age').value;
  const gender = document.getElementById('reg-gender').value;
  const gender_preference = document.getElementById('reg-gender-pref').value;

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, email, name, password, gender, gender_preference, age: parseInt(age) })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'Registration failed.', 'error');
      return;
    }

    showToast('Registration successful! Please verify the OTP sent to your phone.', 'success');
    
    // Switch to OTP panel
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('form-otp').classList.remove('hidden');
    document.getElementById('otp-phone').value = phone;
    document.getElementById('otp-phone-text').innerText = `We have sent a verification code to +91 ${phone}.`;
  } catch (err) {
    showToast('Failed to connect to the server.', 'error');
  }
}

async function handleVerifyOtp(e) {
  e.preventDefault();
  const phone = document.getElementById('otp-phone').value;
  const otp = document.getElementById('otp-code').value;

  try {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'OTP verification failed.', 'error');
      return;
    }

    showToast('Profile activated successfully! You can now log in.', 'success');
    switchAuthTab('login');
  } catch (err) {
    showToast('Failed to verify OTP.', 'error');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'Invalid credentials or unverified profile.', 'error');
      return;
    }

    // Temporarily store token so apiFetch works during biometric scan
    accessToken = data.access_token; 

    // Trigger Biometric face scan gate AFTER verifying credentials but BEFORE showing dashboard
    startFaceBiometricScan(() => {
      // On success, finalize login
      refreshToken = data.refresh_token;
      localStorage.setItem('tm_access_token', accessToken);
      localStorage.setItem('tm_refresh_token', refreshToken);

      showToast('Logged in successfully!', 'success');
      showDashboard();
    });
  } catch (err) {
    showToast('Connection failed.', 'error');
  }
}

// LOGOUT
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
    }
    handleLocalLogout();
    showToast('Logged out successfully.', 'info');
  });
}

async function fetchUserProfile() {
  try {
    const res = await apiFetch(`${API_BASE}/users/me`);
    if (!res.ok) {
      handleLocalLogout();
      return;
    }

    const user = await res.json();
    activeUser = user;
    
    // Cache the user's name for layout navbar rendering
    localStorage.setItem('tm_user_name', user.name);
    const navUserName = document.getElementById('nav-user-name');
    if (navUserName) navUserName.innerText = user.name;

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.innerText = txt;
    };
    
    const setHtml = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    // Fill Header
    setTxt('header-user-name', `Hello, ${user.name}`);

    // Fill Sidebar info
    setTxt('prof-name', user.name);
    setTxt('prof-email', user.email);
    setTxt('prof-phone', user.phone);
    setTxt('prof-gender', user.gender);
    setTxt('prof-gender-pref', user.gender_preference || 'Mixed');
    setTxt('prof-age', user.age || 'Not specified');
    setTxt('prof-experience', user.travel_experience || 'beginner');
    setTxt('prof-accommodation', user.preferred_accommodation || 'hostel');
    setTxt('prof-bio', user.bio || 'No bio added yet. Click Edit Profile to update!');

    // Verification status badge
    const statusBadge = document.getElementById('prof-status-badge');
    const kycContainer = document.getElementById('kyc-action-container');
    if (statusBadge) {
      if (user.verification_status === 'verified') {
        statusBadge.className = 'badge badge-verified';
        statusBadge.innerHTML = '<i class="fa-solid fa-square-check"></i> Verified';
        if (kycContainer) kycContainer.classList.add('hidden');
      } else {
        statusBadge.className = 'badge badge-pending';
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner"></i> Pending OTP';
        if (kycContainer) kycContainer.classList.remove('hidden');
      }
    }

    // Trust Score Badge
    const trustBadge = document.getElementById('prof-trust-badge');
    if (trustBadge) {
      trustBadge.innerHTML = `<i class="fa-solid fa-shield-heart"></i> Trust: ${user.trust_score.toFixed(2)}`;
    }

    // Render Multi-factor verification badges
    const verificationRow = document.getElementById('prof-verification-row');
    if (verificationRow) {
      const emailVerified = `<span class="badge badge-email"><i class="fa-solid fa-circle-check"></i> Email Verified</span>`;
      const phoneVerified = `<span class="badge badge-phone"><i class="fa-solid fa-circle-check"></i> Phone Verified</span>`;
      const aadhaarVerified = user.verification_status === 'verified'
        ? `<span class="badge badge-aadhaar"><i class="fa-solid fa-circle-check"></i> Aadhaar Verified</span>`
        : `<span class="badge badge-secondary" style="opacity:0.6;"><i class="fa-solid fa-circle-minus"></i> Aadhaar Pending</span>`;
      
      verificationRow.innerHTML = `${emailVerified} ${phoneVerified} ${aadhaarVerified}`;
    }

    // Populate Lists (Interests, Travel Styles, Languages)
    const interestsTags = document.getElementById('prof-interests-tags');
    if (interestsTags) populateTags('prof-interests-tags', user.interests);
    
    const travelTags = document.getElementById('prof-travel-styles-tags');
    if (travelTags) populateTags('prof-travel-styles-tags', user.travel_styles);
    
    const langTags = document.getElementById('prof-languages-tags');
    if (langTags) populateTags('prof-languages-tags', user.languages);

    // Populate Emergency Contacts list
    const contactsList = document.getElementById('contacts-list');
    if (contactsList) populateEmergencyContacts(user.emergency_contacts);

    // Check if the user is matched in a Group (FR-07/FR-08)
    const groupPanel = document.getElementById('active-group-panel');
    if (user.group_members && user.group_members.length > 0) {
      const match = user.group_members[0];
      if (match.status === 'accepted') {
        activeGroupId = match.group_id;
        if (groupPanel) groupPanel.classList.remove('hidden');
        fetchGroupDetails(match.group_id);
        initWebSocketChat(match.group_id);
      } else {
        if (groupPanel) groupPanel.classList.add('hidden');
      }
    } else {
      if (groupPanel) groupPanel.classList.add('hidden');
    }

    // Populate Edit modal forms
    setVal('edit-name', user.name);
    setVal('edit-age', user.age || '');
    setVal('edit-gender', user.gender || 'M');
    setVal('edit-gender-pref', user.gender_preference || 'mixed');
    setVal('edit-bio', user.bio || '');
    setVal('edit-experience', user.travel_experience || 'beginner');
    setVal('edit-accommodation', user.preferred_accommodation || 'hostel');
    setVal('edit-interests', user.interests.join(', '));
    setVal('edit-travel-styles', user.travel_styles.join(', '));
    setVal('edit-languages', user.languages.join(', '));

  } catch (err) {
    console.error('Fetch profile failed:', err);
  }
}

// Trigger KYC Identity Verification (Interactive Modal Flow)
function triggerKycVerification() {
  document.getElementById('aadhaar-verification-modal').classList.remove('hidden');
  document.getElementById('aadhaar-step-1').classList.remove('hidden');
  document.getElementById('aadhaar-step-2').classList.add('hidden');
  document.getElementById('aadhaar-number-input').value = '';
  document.getElementById('aadhaar-otp-input').value = '';
}

function closeAadhaarModal() {
  document.getElementById('aadhaar-verification-modal').classList.add('hidden');
}

function goBackToAadhaarStep1() {
  document.getElementById('aadhaar-step-1').classList.remove('hidden');
  document.getElementById('aadhaar-step-2').classList.add('hidden');
}

async function handleSendAadhaarOtp() {
  const numInput = document.getElementById('aadhaar-number-input').value.trim();
  if (!numInput || !numInput.match(/^[0-9]{12}$/)) {
    showToast('Please enter a valid 12-digit Aadhaar number.', 'error');
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE}/safety/verify-kyc/aadhaar-otp`, {
      method: 'POST',
      body: JSON.stringify({ aadhaar_number: numInput })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Verification OTP sent successfully via Email & WhatsApp!', 'success');
      document.getElementById('aadhaar-masked-info').innerHTML = `
        Dispatched to phone: <span class="text-indigo">${data.phone_masked}</span><br>
        Dispatched to email: <span class="text-indigo">${data.email_masked}</span>
      `;
      document.getElementById('aadhaar-step-1').classList.add('hidden');
      document.getElementById('aadhaar-step-2').classList.remove('hidden');
    } else {
      showToast(data.message || 'Failed to send verification code.', 'error');
    }
  } catch (err) {
    showToast('Network error while requesting verification.', 'error');
  }
}

async function handleConfirmAadhaarOtp() {
  const otpInput = document.getElementById('aadhaar-otp-input').value.trim();
  if (!otpInput || !otpInput.match(/^[0-9]{6}$/)) {
    showToast('Please enter a valid 6-digit OTP.', 'error');
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE}/safety/verify-kyc/aadhaar-confirm`, {
      method: 'POST',
      body: JSON.stringify({ otp: otpInput })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Identity verified successfully!', 'success');
      closeAadhaarModal();
      fetchUserProfile();
      fetchAdminLogs();
    } else {
      showToast(data.message || 'Incorrect or expired OTP.', 'error');
    }
  } catch (err) {
    showToast('Network error while validating code.', 'error');
  }
}

function populateTags(containerId, list) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = '<span class="text-muted text-sm">None selected</span>';
    return;
  }
  list.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.innerText = tag;
    container.appendChild(span);
  });
}

function populateEmergencyContacts(contacts) {
  const listEl = document.getElementById('contacts-list');
  listEl.innerHTML = '';

  if (!contacts || contacts.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No emergency contacts saved yet. An emergency contact is recommended for SOS.</p>';
    return;
  }

  contacts.forEach(c => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.innerHTML = `
      <div class="contact-info">
        <h4>${c.name} ${c.is_primary ? '<span class="badge badge-trust" style="font-size:8px; padding: 2px 6px;">Primary</span>' : ''}</h4>
        <p>${c.relationship} • ${c.phone}</p>
      </div>
      <div class="contact-meta">
        <button class="btn-delete" onclick="deleteContact('${c.id}')"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    listEl.appendChild(item);
  });
}

// Emergency Contacts forms toggle
function toggleAddContactForm() {
  const form = document.getElementById('form-add-contact');
  form.classList.toggle('hidden');
}

async function handleAddContact(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value;
  const phone = document.getElementById('contact-phone').value;
  const relationship = document.getElementById('contact-relation').value;
  const is_primary = document.getElementById('contact-primary').checked;

  const updatedContacts = [
    ...(activeUser.emergency_contacts || []).map(c => ({
      name: c.name,
      phone: c.phone,
      relationship: c.relationship,
      is_primary: is_primary ? false : c.is_primary
    })),
    { name, phone, relationship, is_primary }
  ];

  try {
    const res = await apiFetch(`${API_BASE}/users/me`, {
      method: 'PUT',
      body: JSON.stringify({ emergency_contacts: updatedContacts })
    });

    if (res.ok) {
      showToast('Emergency contact added successfully!', 'success');
      toggleAddContactForm();
      fetchUserProfile();
      document.getElementById('contact-name').value = '';
      document.getElementById('contact-phone').value = '';
      document.getElementById('contact-relation').value = '';
    } else {
      showToast('Failed to add contact.', 'error');
    }
  } catch (err) {
    showToast('API request failed.', 'error');
  }
}

async function deleteContact(contactId) {
  const updatedContacts = (activeUser.emergency_contacts || [])
    .filter(c => c.id !== contactId)
    .map(c => ({
      name: c.name,
      phone: c.phone,
      relationship: c.relationship,
      is_primary: c.is_primary
    }));

  try {
    const res = await apiFetch(`${API_BASE}/users/me`, {
      method: 'PUT',
      body: JSON.stringify({ emergency_contacts: updatedContacts })
    });

    if (res.ok) {
      showToast('Emergency contact removed.', 'info');
      fetchUserProfile();
    }
  } catch (err) {
    showToast('Failed to delete contact.', 'error');
  }
}

// Edit profile Modal handlers
function openEditProfileModal() {
  document.getElementById('edit-profile-modal').classList.remove('hidden');
}

function closeEditProfileModal() {
  document.getElementById('edit-profile-modal').classList.add('hidden');
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const name = document.getElementById('edit-name').value;
  const age = document.getElementById('edit-age').value;
  const gender = document.getElementById('edit-gender').value;
  const gender_preference = document.getElementById('edit-gender-pref').value;
  const bio = document.getElementById('edit-bio').value;
  const travel_experience = document.getElementById('edit-experience').value;
  const preferred_accommodation = document.getElementById('edit-accommodation').value;
  
  const interests = document.getElementById('edit-interests').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
  
  const travel_styles = document.getElementById('edit-travel-styles').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const languages = document.getElementById('edit-languages').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  try {
    const res = await apiFetch(`${API_BASE}/users/me`, {
      method: 'PUT',
      body: JSON.stringify({
        name, age: parseInt(age), gender, gender_preference, bio,
        travel_experience, preferred_accommodation, interests, travel_styles, languages
      })
    });

    if (res.ok) {
      showToast('Profile updated successfully!', 'success');
      closeEditProfileModal();
      fetchUserProfile();
    } else {
      const data = await res.json();
      showToast(data.message || 'Failed to update profile.', 'error');
    }
  } catch (err) {
    showToast('Network error updating profile.', 'error');
  }
}

// Soft Deactivate Profile
async function handleDeleteProfile() {
  if (!confirm('Are you sure you want to deactivate your account? This performs a compliant soft-delete.')) {
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE}/users/me`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Account deactivated successfully. Logging out.', 'info');
      setTimeout(() => {
        handleLocalLogout();
      }, 2000);
    } else {
      showToast('Failed to deactivate account.', 'error');
    }
  } catch (err) {
    showToast('Request failed.', 'error');
  }
}

// TRIP MATCH REQUEST MANAGEMENT
function toggleCreateTripForm() {
  const form = document.getElementById('form-create-trip');
  if (!form) return;
  form.classList.toggle('hidden');
  const title = document.getElementById('trip-form-title');
  if (title) title.innerText = 'New Matching Request';
  const editId = document.getElementById('trip-edit-id');
  if (editId) editId.value = '';
  const dest = document.getElementById('trip-dest');
  if (dest) dest.value = '';
  const interests = document.getElementById('trip-interests');
  if (interests) interests.value = '';
  const start = document.getElementById('trip-start-date');
  if (start) start.value = '';
  const end = document.getElementById('trip-end-date');
  if (end) end.value = '';
}

async function fetchTrips() {
  try {
    const res = await apiFetch(`${API_BASE}/trips`);
    if (!res.ok) return;

    const trips = await res.json();
    const listEl = document.getElementById('trips-list');
    const activeListEl = document.getElementById('active-trips-list');
    const upcomingListEl = document.getElementById('upcoming-trips-list');
    const pastListEl = document.getElementById('past-trips-list');
    const tripsEmptyEl = document.getElementById('trips-empty-state');

    if (!listEl && !activeListEl) return;

    if (listEl) {
      listEl.innerHTML = '';
      if (trips.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No matching travel requests created yet. Tap Create Request to find buddies!</p>';
        return;
      }

      trips.forEach(trip => {
        const card = document.createElement('div');
        card.className = 'trip-card';
        card.innerHTML = `
          <div class="trip-info">
            <h4>${trip.destination} <span>${trip.status}</span></h4>
            <p><i class="fa-solid fa-calendar-days"></i> ${trip.start_date} to ${trip.end_date} | <i class="fa-solid fa-wallet"></i> Budget: ${trip.budget_tier}</p>
            <p><i class="fa-solid fa-users"></i> Group bounds: ${trip.preferred_group_size_min}-${trip.preferred_group_size_max} buddies</p>
            <div class="tags-list">
              ${trip.interests.map(i => `<span class="tag">${i}</span>`).join('')}
            </div>
          </div>
          <div class="trip-actions">
            <button class="btn btn-secondary btn-sm" onclick="editTrip('${trip.trip_id}', '${trip.destination}', '${trip.start_date}', '${trip.end_date}', '${trip.budget_tier}', ${trip.preferred_group_size_min}, ${trip.preferred_group_size_max}, '${trip.interests.join(', ')}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger-outline btn-sm" onclick="closeTrip('${trip.trip_id}')"><i class="fa-solid fa-square-xmark"></i> Close</button>
          </div>
        `;
        listEl.appendChild(card);
      });
    }

    if (activeListEl) {
      activeListEl.innerHTML = '';
      if (upcomingListEl) upcomingListEl.innerHTML = '';
      if (pastListEl) pastListEl.innerHTML = '';
      
      const activeTrips = trips.filter(t => t.status === 'forming');
      const upcomingTrips = trips.filter(t => t.status === 'confirmed' || t.status === 'locked');
      const pastTrips = trips.filter(t => t.status === 'closed');

      if (trips.length === 0 && tripsEmptyEl) {
        tripsEmptyEl.classList.remove('hidden');
      } else if (tripsEmptyEl) {
        tripsEmptyEl.classList.add('hidden');
      }

      const createCard = (trip) => {
        const div = document.createElement('div');
        div.className = 'trip-card';
        const formattedStart = new Date(trip.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const formattedEnd = new Date(trip.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        
        let badgeClass = 'badge-forming';
        if (trip.status === 'confirmed') badgeClass = 'badge-confirmed';
        if (trip.status === 'locked') badgeClass = 'badge-locked';
        
        div.innerHTML = `
          <div class="trip-card-header">
            <div>
              <h3 class="trip-destination">${trip.destination}</h3>
              <p class="trip-dates"><i class="fa-solid fa-calendar-days"></i> ${formattedStart} - ${formattedEnd}</p>
            </div>
            <span class="badge ${badgeClass}">${trip.status.toUpperCase()}</span>
          </div>
          <div class="trip-details-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0; background:rgba(45,58,140,0.03); padding:12px; border-radius:8px;">
            <div class="trip-detail-item"><i class="fa-solid fa-wallet" style="color:var(--accent-color);"></i> Budget: ${trip.budget_tier.toUpperCase()}</div>
            <div class="trip-detail-item"><i class="fa-solid fa-users" style="color:var(--accent-color);"></i> Size: ${trip.preferred_group_size_min}-${trip.preferred_group_size_max}</div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="trip-members" style="display:flex; align-items:center;">
              <div class="trip-member-avatar" style="width:32px; height:32px; border-radius:50%; background:#2D3A8C; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; border:2px solid #fff;">P1</div>
              <div class="trip-member-avatar" style="width:32px; height:32px; border-radius:50%; background:#E8613A; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; border:2px solid #fff; margin-left:-8px;">P2</div>
            </div>
            ${trip.status === 'forming' ? `
              <button class="btn btn-secondary btn-sm" onclick="editTrip('${trip.trip_id}', '${trip.destination}', '${trip.start_date}', '${trip.end_date}', '${trip.budget_tier}', ${trip.preferred_group_size_min}, ${trip.preferred_group_size_max}, '${trip.interests.join(', ')}')"><i class="fa-solid fa-pen"></i> Edit</button>
            ` : ''}
          </div>
        `;
        return div;
      };

      activeTrips.forEach(t => activeListEl.appendChild(createCard(t)));
      
      if (upcomingListEl) {
        if (upcomingTrips.length === 0) {
          upcomingListEl.innerHTML = '<p class="text-muted text-sm" style="grid-column: span 2;">No upcoming confirmed trips.</p>';
        } else {
          upcomingTrips.forEach(t => upcomingListEl.appendChild(createCard(t)));
        }
      }

      if (pastListEl) {
        if (pastTrips.length === 0) {
          pastListEl.innerHTML = '<p class="text-muted text-sm" style="grid-column: span 2;">No past trips recorded.</p>';
        } else {
          pastTrips.forEach(t => pastListEl.appendChild(createCard(t)));
        }
      }
    }
  } catch (err) {
    console.error('Fetch trips failed:', err);
  }
}

async function handleCreateTrip(e) {
  e.preventDefault();
  const tripId = document.getElementById('trip-edit-id').value;
  const destination = document.getElementById('trip-dest').value;
  const budget_tier = document.getElementById('trip-budget').value;
  const start_date = document.getElementById('trip-start-date').value;
  const end_date = document.getElementById('trip-end-date').value;
  const preferred_group_size_min = parseInt(document.getElementById('trip-min-size').value);
  const preferred_group_size_max = parseInt(document.getElementById('trip-max-size').value);
  const interests = document.getElementById('trip-interests').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const url = tripId ? `${API_BASE}/trips/${tripId}` : `${API_BASE}/trips`;
  const method = tripId ? 'PUT' : 'POST';

  try {
    const res = await apiFetch(url, {
      method,
      body: JSON.stringify({
        destination, budget_tier, start_date, end_date,
        preferred_group_size_min, preferred_group_size_max, interests
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(tripId ? 'Trip matching request updated!' : 'Trip matching request published!', 'success');
      document.getElementById('form-create-trip').classList.add('hidden');
      fetchTrips();
    } else {
      showToast(data.message || 'Failed to submit trip request.', 'error');
    }
  } catch (err) {
    showToast('Network request failed.', 'error');
  }
}

function editTrip(id, dest, start, end, budget, min, max, interests) {
  const modal = document.getElementById('create-trip-modal');
  if (modal) modal.classList.remove('hidden');

  const form = document.getElementById('form-create-trip');
  if (form) form.classList.remove('hidden');

  const title = document.getElementById('trip-form-title');
  if (title) title.innerText = 'Edit Matching Request';

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('trip-edit-id', id);
  setVal('trip-dest', dest);
  setVal('trip-start-date', start);
  setVal('trip-end-date', end);
  setVal('trip-budget', budget);
  setVal('trip-min-size', min);
  setVal('trip-max-size', max);
  setVal('trip-interests', interests);
}

async function closeTrip(tripId) {
  if (!confirm('Are you sure you want to close this trip request?')) {
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE}/trips/${tripId}/close`, { method: 'POST' });
    if (res.ok) {
      showToast('Trip request closed.', 'info');
      fetchTrips();
    } else {
      showToast('Failed to close trip request.', 'error');
    }
  } catch (err) {
    showToast('Request failed.', 'error');
  }
}

// ============================================================
// GROUP DASHBOARD & SUB-TABS (FR-07/FR-08/FR-18/FR-19/FR-26/FR-27/FR-31)
// ============================================================

function switchGroupView(view) {
  const views = ['members', 'chat', 'itinerary', 'budget', 'polls'];
  views.forEach(v => {
    const panel = document.getElementById(`g-view-${v}`);
    if (v === view) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });

  // Set active tab styling
  const btns = document.querySelectorAll('.g-tab-btn');
  btns.forEach(btn => {
    if (btn.innerText.toLowerCase().includes(view.toLowerCase())) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (view === 'itinerary') fetchGroupItinerary();
  if (view === 'budget') fetchGroupExpenses();
  if (view === 'polls') fetchGroupPolls();
}

async function fetchGroupDetails(groupId) {
  try {
    // We query Admin stats or a group specific endpoint (let's check admin stats to load group members list for simplicity)
    const res = await apiFetch(`${API_BASE}/admin/dashboard`);
    if (!res.ok) return;

    const data = await res.json();
    const groupInfo = data.groups_health.find(g => g.group_id === groupId);
    if (groupInfo) {
      document.getElementById('group-title').innerHTML = `<i class="fa-solid fa-users-rectangle"></i> Expedition to ${groupInfo.destination} <span>${groupInfo.status}</span>`;
      document.getElementById('group-dates').innerText = `${groupInfo.start_date} to ${groupInfo.end_date} | Size: ${groupInfo.size} Buddies`;
    }

    // Populate Matched Members
    const membersEl = document.getElementById('group-members-list');
    membersEl.innerHTML = '';

    // Simulate group members based on matching results or fetch from admin log
    // For demo purposes, we fetch all active members from profile
    const groupMembersMock = [
      { name: activeUser.name, role: 'trip_buddy', status: 'verified', trust: activeUser.trust_score },
      { name: 'Aarav Mehta', role: 'trip_buddy', status: 'verified', trust: 0.88 },
      { name: 'Priya Sharma', role: 'member', status: 'verified', trust: 0.91 },
      { name: 'Vikram Singh', role: 'member', status: 'verified', trust: 0.78 }
    ];

    groupMembersMock.forEach(m => {
      const card = document.createElement('div');
      card.className = 'contact-item';
      card.innerHTML = `
        <div class="contact-info">
          <h4>${m.name} <span class="tag text-xxs" style="background:rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); font-size:10px;">${m.role}</span></h4>
          <p><i class="fa-solid fa-shield-halved text-success"></i> ${m.status.toUpperCase()} • Trust Score: ${m.trust.toFixed(2)}</p>
        </div>
      `;
      membersEl.appendChild(card);
    });

  } catch (err) {
    console.error('Fetch group details error:', err);
  }
}

// WebSocket Live Group Chat room (FR-18)
function initWebSocketChat(groupId) {
  if (chatSocket) {
    chatSocket.close();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const wsUrl = `${protocol}${window.location.host}/chat?token=${accessToken}`;
  
  console.log('[WebSocket] Connecting to chat server...', wsUrl);
  chatSocket = new WebSocket(wsUrl);

  chatSocket.onopen = () => {
    console.log('[WebSocket] Chat room connection active.');
    const logBox = document.getElementById('chat-messages');
    logBox.innerHTML = '<div class="system-msg">Connected to group secure chat room.</div>';
  };

  chatSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const logBox = document.getElementById('chat-messages');

      const msgDiv = document.createElement('div');
      if (data.type === 'system') {
        msgDiv.className = 'system-msg';
        msgDiv.innerText = data.message;
      } else if (data.type === 'message') {
        msgDiv.className = data.userId === activeUser.user_id ? 'my-msg' : 'other-msg';
        msgDiv.innerHTML = `
          <span class="sender-name">${data.senderName}</span>
          <p class="msg-text">${data.text}</p>
          <span class="msg-time">${new Date(data.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
      }
      logBox.appendChild(msgDiv);
      logBox.scrollTop = logBox.scrollHeight;
    } catch (err) {
      console.error('[WebSocket message parse error]', err);
    }
  };

  chatSocket.onerror = (err) => {
    console.error('[WebSocket error event]', err);
  };

  chatSocket.onclose = () => {
    console.log('[WebSocket] Connection closed.');
  };
}

function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;

  chatSocket.send(JSON.stringify({
    type: 'message',
    text
  }));
  input.value = '';
}

// SOS Alert triggers (FR-19)
async function triggerSOSAlert() {
  if (!confirm('🚨 ALERT: Are you in immediate danger? Triggering SOS will locate you and alert local police + emergency contacts!')) {
    return;
  }

  // Obtain user GPS coordinates (mocked for simplicity)
  const lat = 32.2396;
  const lon = 77.1887;

  try {
    const res = await apiFetch(`${API_BASE}/safety/sos`, {
      method: 'POST',
      body: JSON.stringify({
        latitude: lat,
        longitude: lon,
        group_id: activeGroupId
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('🚨 SOS Alerts dispatched successfully. Police and emergency contacts notified.', 'error');
      fetchAdminLogs();
    } else {
      showToast(data.message || 'Failed to trigger SOS.', 'error');
    }
  } catch (err) {
    showToast('Failed to dispatch alert.', 'error');
  }
}

// Cooperative Itinerary (FR-26)
function toggleEditItineraryForm() {
  document.getElementById('form-itinerary-item').classList.toggle('hidden');
}

async function fetchGroupItinerary() {
  try {
    const res = await apiFetch(`${API_BASE}/itineraries/${activeGroupId}`);
    if (!res.ok) return;

    const data = await res.json();
    activeItineraryId = data.itinerary_id;
    activeItineraryVersion = data.version;

    const listEl = document.getElementById('group-itinerary-items');
    listEl.innerHTML = '';

    if (!data.itinerary_items || data.itinerary_items.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No schedule items loaded yet. Add items to build itinerary.</p>';
      return;
    }

    data.itinerary_items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'itinerary-item';
      div.innerHTML = `
        <div class="itinerary-item-title">
          Day ${item.day_number} — ${item.title} <span>${item.start_time || 'All Day'} • ${item.location ? `<a href="https://www.google.com/maps/search/${encodeURIComponent(item.location)}" target="_blank" class="location-link">${item.location}</a>` : 'Base'}</span>
        </div>
        <div class="itinerary-item-desc">${item.description || 'No description added.'}</div>
      `;
      listEl.appendChild(div);
    });
  } catch (err) {
    console.error('Fetch itinerary error:', err);
  }
}

async function saveItineraryItem(e) {
  e.preventDefault();
  const day = document.getElementById('itinerary-day').value;
  const title = document.getElementById('itinerary-title').value;
  const desc = document.getElementById('itinerary-desc').value;
  const loc = document.getElementById('itinerary-loc').value;
  const time = document.getElementById('itinerary-time').value;

  // Retrieve current items list
  const itineraryRes = await apiFetch(`${API_BASE}/itineraries/${activeGroupId}`);
  const currentItinerary = await itineraryRes.json();
  const items = currentItinerary.itinerary_items || [];

  const updatedItems = [
    ...items.map(i => ({
      day_number: i.day_number,
      title: i.title,
      description: i.description,
      location: i.location,
      start_time: i.start_time,
      sort_order: i.sort_order
    })),
    {
      day_number: parseInt(day),
      title,
      description: desc,
      location: loc,
      start_time: time,
      sort_order: 0
    }
  ];

  try {
    const res = await apiFetch(`${API_BASE}/itineraries/${activeItineraryId}/items`, {
      method: 'PUT',
      body: JSON.stringify({
        items: updatedItems,
        version: activeItineraryVersion // Optimistic lock checker
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Itinerary updated successfully!', 'success');
      document.getElementById('form-itinerary-item').classList.add('hidden');
      
      // Clear inputs
      document.getElementById('itinerary-day').value = '';
      document.getElementById('itinerary-title').value = '';
      document.getElementById('itinerary-desc').value = '';
      document.getElementById('itinerary-loc').value = '';
      document.getElementById('itinerary-time').value = '';

      fetchGroupItinerary();
      fetchAdminLogs();
    } else {
      showToast(data.message || 'Optimistic concurrency error: The itinerary has been updated elsewhere.', 'error');
    }
  } catch (err) {
    showToast('Network error updating itinerary.', 'error');
  }
}

// Expense Splits (FR-27)
function toggleAddExpenseForm() {
  document.getElementById('form-add-expense').classList.toggle('hidden');
}

async function fetchGroupExpenses() {
  try {
    const res = await apiFetch(`${API_BASE}/expenses/${activeGroupId}/balances`);
    if (!res.ok) return;

    const data = await res.json();

    // Render transfers instructions
    const transfersEl = document.getElementById('suggested-transfers-list');
    transfersEl.innerHTML = '';
    
    if (!data.suggested_transfers || data.suggested_transfers.length === 0) {
      transfersEl.innerHTML = '<p class="empty-state" style="padding:15px; border-style:solid;">All bills are fully settled! No payments pending.</p>';
    } else {
      data.suggested_transfers.forEach(t => {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.style.marginBottom = '6px';
        div.innerHTML = `
          <div class="contact-info">
            <h4>${t.fromName} ➜ ${t.toName}</h4>
            <p>Settle payment amount: <strong>₹${t.amount.toFixed(2)}</strong></p>
          </div>
        `;
        transfersEl.appendChild(div);
      });
    }

    // Render expenses ledger list
    const ledgerEl = document.getElementById('group-expenses-list');
    ledgerEl.innerHTML = '';
    
    if (data.expenses.length === 0) {
      ledgerEl.innerHTML = '<p class="empty-state">No expense splits logged yet.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'expenses-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Description</th>
          <th>Paid By</th>
          <th>Category</th>
          <th>Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        ${data.expenses.map(e => `
          <tr>
            <td>${e.description}</td>
            <td>${e.paid_by_name}</td>
            <td><span class="tag text-xxs">${e.category}</span></td>
            <td>₹${e.amount.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    ledgerEl.appendChild(table);

  } catch (err) {
    console.error('Fetch group expenses error:', err);
  }
}

async function submitNewExpense(e) {
  e.preventDefault();
  const desc = document.getElementById('exp-description').value;
  const amount = document.getElementById('exp-amount').value;
  const category = document.getElementById('exp-category').value;

  // Retrieve matched members to split equal shares
  const adminRes = await apiFetch(`${API_BASE}/admin/dashboard`);
  const adminData = await adminRes.json();
  const groupInfo = adminData.groups_health.find(g => g.group_id === activeGroupId);
  const size = groupInfo ? groupInfo.size : 4;

  // Calculate split share
  const parsedAmt = parseFloat(amount);
  const share = Number((parsedAmt / size).toFixed(2));
  
  // We mock the user ids in the group
  // To keep balance solver accurate, we split equal shares between user profile details
  const splits = [
    { user_id: activeUser.user_id, share_amount: share },
    { user_id: 'd149d0d1-c921-4b92-8d0a-b81b2f1c0123', share_amount: share }, // aarav mock id
    { user_id: 'd149d0d1-c921-4b92-8d0a-b81b2f1c0124', share_amount: share }, // priya mock id
    { user_id: 'd149d0d1-c921-4b92-8d0a-b81b2f1c0125', share_amount: share }  // vikram mock id
  ];

  // Adjust last split for round-offs
  const sumSplits = splits.slice(0, -1).reduce((sum, s) => sum + s.share_amount, 0);
  splits[splits.length - 1].share_amount = Number((parsedAmt - sumSplits).toFixed(2));

  try {
    const res = await apiFetch(`${API_BASE}/expenses`, {
      method: 'POST',
      body: JSON.stringify({
        group_id: activeGroupId,
        amount: parsedAmt,
        description: desc,
        category,
        splits
      })
    });

    if (res.ok) {
      showToast('Shared expense logged and split successfully!', 'success');
      document.getElementById('form-add-expense').classList.add('hidden');
      
      // Clear inputs
      document.getElementById('exp-description').value = '';
      document.getElementById('exp-amount').value = '';
      
      fetchGroupExpenses();
      fetchAdminLogs();
    } else {
      showToast('Failed to log expense.', 'error');
    }
  } catch (err) {
    showToast('Network request failed.', 'error');
  }
}

// Group Polls (FR-31)
function toggleCreatePollForm() {
  document.getElementById('form-create-poll').classList.toggle('hidden');
}

async function fetchGroupPolls() {
  try {
    const res = await apiFetch(`${API_BASE}/polls/${activeGroupId}`);
    if (!res.ok) return;

    const polls = await res.json();
    const listEl = document.getElementById('group-polls-list');
    listEl.innerHTML = '';

    if (polls.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No polls created for this group yet.</p>';
      return;
    }

    polls.forEach(poll => {
      const card = document.createElement('div');
      card.className = 'trip-card mb-2';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'stretch';
      
      card.innerHTML = `
        <h4 style="font-size:15px; font-weight:600; margin-bottom:12px;"><i class="fa-solid fa-square-poll-vertical text-purple"></i> ${poll.question}</h4>
        <div class="poll-options-grid" style="display:flex; flex-direction:column; gap:8px;">
          ${poll.options.map(opt => `
            <button class="btn btn-secondary btn-sm" onclick="voteInPoll('${poll.poll_id}', '${opt.option_id}')" style="justify-content:space-between; width:100%;">
              <span>${opt.text}</span>
              <strong style="color:var(--accent-cyan);">${opt.votes_count} Votes (${opt.voters.join(', ')})</strong>
            </button>
          `).join('')}
        </div>
      `;
      listEl.appendChild(card);
    });
  } catch (err) {
    console.error('Fetch polls error:', err);
  }
}

async function submitNewPoll(e) {
  e.preventDefault();
  const question = document.getElementById('poll-question').value;
  const opt1 = document.getElementById('poll-option-1').value;
  const opt2 = document.getElementById('poll-option-2').value;
  const opt3 = document.getElementById('poll-option-3').value;

  const options = [opt1, opt2];
  if (opt3.trim()) options.push(opt3.trim());

  try {
    const res = await apiFetch(`${API_BASE}/polls`, {
      method: 'POST',
      body: JSON.stringify({
        group_id: activeGroupId,
        question,
        options
      })
    });

    if (res.ok) {
      showToast('Poll published successfully!', 'success');
      document.getElementById('form-create-poll').classList.add('hidden');
      
      // Clear inputs
      document.getElementById('poll-question').value = '';
      document.getElementById('poll-option-1').value = '';
      document.getElementById('poll-option-2').value = '';
      document.getElementById('poll-option-3').value = '';

      fetchGroupPolls();
    } else {
      showToast('Failed to publish poll.', 'error');
    }
  } catch (err) {
    showToast('Request failed.', 'error');
  }
}

async function voteInPoll(pollId, optionId) {
  try {
    const res = await apiFetch(`${API_BASE}/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId })
    });

    if (res.ok) {
      showToast('Vote recorded successfully!', 'success');
      fetchGroupPolls();
    } else {
      showToast('Failed to submit vote.', 'error');
    }
  } catch (err) {
    showToast('Request error.', 'error');
  }
}

// ============================================================
// TOUR GUIDES MARKETPLACE (FR-10/FR-32/FR-34)
// ============================================================
async function fetchMarketplaceGuides() {
  try {
    const res = await apiFetch(`${API_BASE}/guides`);
    if (!res.ok) return;

    const guides = await res.json();
    const listEl = document.getElementById('guides-marketplace-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (guides.length === 0) {
      listEl.innerHTML = '<p class="empty-state" style="grid-column: span 3;">No tour guides registered in this area.</p>';
      return;
    }

    guides.forEach(g => {
      const card = document.createElement('div');
      card.className = 'contact-item';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'stretch';
      card.style.gap = '10px';
      
      card.innerHTML = `
        <div class="contact-info">
          <h4>${g.name} <span class="badge badge-verified" style="font-size:7px; padding: 2px 6px;">Verified Guide</span></h4>
          <p style="margin-top:4px;">Specialties: ${g.specialties.join(', ')}</p>
          <p>Exp: ${g.experience_years} years • Languages: ${g.languages.join(', ')}</p>
          <p>Rate: <strong>₹${g.hourly_rate}/hr</strong> | Trust: ${g.trust_score.toFixed(2)}</p>
        </div>
        <button class="btn btn-primary btn-sm btn-block" onclick="bookGuideMock('${g.guide_id}', ${g.hourly_rate * 8})">
          <i class="fa-solid fa-calendar-check"></i> Book Tour Guide
        </button>
      `;
      listEl.appendChild(card);
    });
  } catch (err) {
    console.error('Fetch guides marketplace error:', err);
  }
}

async function bookGuideMock(guideId, bookingPrice) {
  if (!activeGroupId) {
    showToast('You must have a matched, active group to hire a guide.', 'error');
    return;
  }

  if (!confirm(`Confirm hiring guide? Booking cost ₹${bookingPrice.toFixed(2)} split among group. Proceed to payment checkout.`)) {
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE}/guides/booking`, {
      method: 'POST',
      body: JSON.stringify({
        group_id: activeGroupId,
        guide_id: guideId,
        amount: bookingPrice
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'Failed to initiate guide booking.', 'error');
      return;
    }

    if (data.mock) {
      // Mock Sandbox Checkout
      console.log('[Razorpay MOCK] Order details received:', data);
      const simulateSuccess = confirm(`[Razorpay Sandbox Simulation]
Order ID: ${data.payment_intent_id}
Amount: ₹${bookingPrice.toFixed(2)}

Click "OK" to simulate SUCCESSFUL payment.
Click "Cancel" to simulate CANCELLED/FAILED payment.`);

      if (!simulateSuccess) {
        showToast('Payment cancelled by traveler.', 'info');
        return;
      }

      // Call verify endpoint with mock signature payload
      const verifyRes = await apiFetch(`${API_BASE}/guides/booking/verify`, {
        method: 'POST',
        body: JSON.stringify({
          group_id: activeGroupId,
          guide_id: guideId,
          amount: bookingPrice,
          razorpay_order_id: data.payment_intent_id,
          razorpay_payment_id: 'pay_mock_' + Math.random().toString(36).substring(7),
          razorpay_signature: 'mock_signature_valid'
        })
      });

      const verifyData = await verifyRes.json();
      if (verifyRes.ok) {
        showToast(`Hired! Guide linked. Booking ID: ${verifyData.booking_id}. Payment verified via Mock Signature.`, 'success');
        fetchUserProfile();
        fetchAdminLogs();
      } else {
        showToast('Verification failed: ' + verifyData.message, 'error');
      }
    } else {
      // Real Razorpay Checkout Modal
      const options = {
        key: data.razorpay_key_id,
        amount: data.amount_paise,
        currency: data.currency,
        name: 'TravelMate Group Travel',
        description: `Booking Tour Guide (Cost ₹${bookingPrice})`,
        order_id: data.payment_intent_id,
        handler: async function (response) {
          showToast('Payment captured. Verifying signature...', 'info');
          const verifyRes = await apiFetch(`${API_BASE}/guides/booking/verify`, {
            method: 'POST',
            body: JSON.stringify({
              group_id: activeGroupId,
              guide_id: guideId,
              amount: bookingPrice,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });

          const verifyData = await verifyRes.json();
          if (verifyRes.ok) {
            showToast(`Hired! Guide linked to group. Booking Confirmed via Razorpay. Booking ID: ${verifyData.booking_id}`, 'success');
            fetchUserProfile();
            fetchAdminLogs();
          } else {
            showToast('Payment verification failed: ' + verifyData.message, 'error');
          }
        },
        prefill: {
          name: userProfile?.name || 'Verified Traveler',
          email: userProfile?.email || 'traveler@travelmate.com',
          contact: userProfile?.phone || ''
        },
        theme: {
          color: '#6366f1'
        }
      };
      
      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        showToast('Payment failed: ' + response.error.description, 'error');
      });
      rzp.open();
    }
  } catch (err) {
    showToast('Network error during checkout.', 'error');
  }
}

// ============================================================
// ADMIN ACTIONS & AUDIT LOGS (FR-43/FR-47)
// ============================================================
function toggleAdminDashboardView() {
  document.getElementById('admin-dashboard-panel').classList.toggle('hidden');
}

async function fetchAdminLogs() {
  try {
    const res = await apiFetch(`${API_BASE}/admin/dashboard`);
    if (!res.ok) return;

    const data = await res.json();

    // Populate Audit logs list
    const auditsEl = document.getElementById('admin-audits-list');
    if (auditsEl) {
      auditsEl.innerHTML = '';
      if (data.recent_audits.length === 0) {
        auditsEl.innerHTML = '<p class="text-muted">No audit logs written yet.</p>';
      } else {
        data.recent_audits.forEach(a => {
          const div = document.createElement('div');
          div.className = 'itinerary-item';
          div.style.padding = '8px';
          div.style.marginBottom = '6px';
          div.innerHTML = `
            <strong>[${new Date(a.created_at).toLocaleTimeString()}] ${a.action}</strong> ➜ by ${a.actor_name} on ${a.entity_type} (${a.entity_id.substring(0,8)})
          `;
          auditsEl.appendChild(div);
        });
      }
    }

    // Populate Flagged reports list
    const reportsEl = document.getElementById('admin-reports-list');
    if (reportsEl) {
      reportsEl.innerHTML = '';
      if (data.flagged_reports.length === 0) {
        reportsEl.innerHTML = '<p class="text-muted">No pending abuse reports.</p>';
      } else {
        data.flagged_reports.forEach(r => {
          const div = document.createElement('div');
          div.className = 'itinerary-item';
          div.style.padding = '8px';
          div.style.marginBottom = '6px';
          div.innerHTML = `
            <strong>Reporter: ${r.reporter_name}</strong> ➜ Reported: ${r.reported_user_name} (${r.reported_user_phone})<br/>
            Reason: <strong class="text-red">${r.reason.toUpperCase()}</strong> • Details: ${r.description || 'none'}
          `;
          reportsEl.appendChild(div);
        });
      }
    }

  } catch (err) {
    console.error('Fetch admin stats failed:', err);
  }
}

// Trigger Matching Job run (FR-04/FR-05/FR-06/FR-12)
async function triggerMatchingOptimizer() {
  try {
    showToast('Launching optimizer matching graph worker...', 'info');
    
    const res = await apiFetch(`${API_BASE}/matching/run`, { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      showToast(`Matching complete! Formed ${data.groups_formed} optimal travel groups.`, 'success');
      fetchUserProfile();
      fetchAdminLogs();
    } else {
      showToast(data.message || 'Matching locked or already running.', 'error');
    }
  } catch (err) {
    showToast('Failed to trigger matching optimization.', 'error');
  }
}

// Abuse reports & Risk engine simulation (FR-23)
async function triggerRiskSimulation() {
  const victimName = prompt("Enter Name of the travel user you want to report for harassment/fraud (e.g. Vikram Singh):");
  if (!victimName) return;

  // Verify user details via admin statistics
  const adminRes = await apiFetch(`${API_BASE}/admin/dashboard`);
  const adminData = await adminRes.json();
  
  // Try to find the matched user or use a dummy ID
  const reportedUser = { user_id: 'd149d0d1-c921-4b92-8d0a-b81b2f1c0125' }; // vikram mock id
  
  try {
    const res = await apiFetch(`${API_BASE}/safety/report`, {
      method: 'POST',
      body: JSON.stringify({
        reported_user_id: reportedUser.user_id,
        reason: 'harassment',
        description: `Flagging user ${victimName} for investigation.`
      })
    });

    const data = await res.json();
    if (res.ok) {
      if (data.auto_actioned) {
        showToast(`🚨 Risk alert: reported user exceeded threshold. COMPLIANT BANNED & Auto-removed!`, 'error');
      } else {
        showToast('Report logged. Risk index score updated in queue.', 'info');
      }
      fetchAdminLogs();
    } else {
      showToast(data.message || 'Report request failed.', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to moderation risk engine.', 'error');
  }
}

const itineraries = {
  Manali: [
    { 
      day: 1, 
      title: 'Arrival, Acclimatization & Old Manali Heritage Cafe Hopping', 
      time: '09:00 AM - 12:30 AM', 
      loc: 'Old Manali Backpacker Zostel', 
      desc: 'Arrival at 09:00 hrs at Manali Volvo stand. Take a local auto to Zostel by 09:30 hrs. Check in, unpack, and rest/sleep until 12:00 hrs to adjust to high-altitude pressure. Wake up at 12:00 hrs to meet matched group buddies in the common lounge. Go on a guided walk through Old Manali village orchards from 15:00 hrs to 17:00 hrs. Return and rest. Go to the Riverside Acoustic Music Fest from 19:00 hrs to 22:00 hrs, enjoying a warm local Trout fish dinner at Cafe 1947 at 22:30 hrs. Gather and sit in front of a warm bonfire in the hostel courtyard from 23:00 hrs to 00:30 hrs sharing stories before sleeping.',
      distance: '0.5 km to 1.2 km walk from hostel base',
      travel: '🚶 10-15 mins walking (Free). Walk down Clubhouse Road, cross the iron bridge over Manalsu river, and proceed up the cobblestone path.',
      food: '🍕 Cafe 1947 - 4.5★ (Famous wood-fired Trout Pizza ₹550 & Ginger Lemon Honey tea ₹120. Avg cost ₹400/head); Dylan\'s Toasted & Roasted (4.6★ - fresh Chocolate Cookies ₹80)',
      guide: '🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Total guide split: ₹1500/day for 8 members (just ₹187.50 per traveler). Leads the village heritage walk.',
      alternatives: [
        {
          title: 'Museum of Himachal Culture & Folk Art & Ghatotkach Tree Temple',
          time: '11:00 AM - 04:00 PM',
          loc: 'Dhungri Pine Forest limits',
          desc: 'Waking up at 08:00 hrs. Breakfast of toast and local honey at 09:00 hrs. Take a scenic walk through the oak forest to the Museum of Himachal Culture. View traditional wood carvings, old houses, and regional costumes from 11:00 hrs to 13:00 hrs. Walk to the Ghatotkach Tree Temple at 13:30 hrs. Rest in the quiet woods, enjoying nature.',
          distance: '1.5 km from hostel base',
          travel: '🚶 20 mins walking (Free). Clear well-marked trail from Zostel.',
          food: '🍲 Johnson\'s Cafe - 4.3★ (Famous for outdoor seating. Try: Himachali Grilled Chicken ₹450 & local cider)',
          guide: '🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Coordinates entry tickets (₹50).'
        },
        {
          title: 'Vashisht Village & Jogini Waterfall Short Hike',
          time: '12:30 PM - 05:00 PM',
          loc: 'Vashisht Hot Springs',
          desc: 'Waking up at 09:00 hrs. Late breakfast at 10:00 hrs. Take shared auto to Vashisht at 11:30 hrs. Start a short hike along the pine-fringed cliffs to Jogini Falls from 12:30 hrs to 14:30 hrs. Rest and take photographs. Return and take a hot bath in natural hot springs.',
          distance: '4.5 km from hostel base',
          travel: '🛺 Shared auto-rickshaw (₹30/head) to Vashisht, then 40 mins walking hike.',
          food: '☕ Vashisht German Bakery - 4.1★ (Yak Cheese Sandwich ₹150 and filter coffee ₹90)',
          guide: '🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Leads the waterfall hike.'
        }
      ]
    },
    { 
      day: 2, 
      title: 'Solang Valley Trek, Paragliding & Adventure Sports', 
      time: '07:00 AM - 11:30 PM', 
      loc: 'Solang Valley heights', 
      desc: 'Getting up at 07:00 hrs. Join a 15-minute quick warm-up session. Breakfast at the hostel kitchen at 08:00 hrs (08:00 hrs). Board the local bus at 08:30 hrs to Solang Valley. Go on the waterfall trek and viewpoints hike from 10:00 hrs to 13:00 hrs. Optional paragliding or zorbing with group buddies. Have lunch at Solang Ridge Cafe from 13:30 hrs to 14:30 hrs. Return to the hostel at 16:00 hrs and rest/sleep. Go to the Alpine DJ Fest and local folk dance festival from 18:00 hrs to 21:30 hrs. Enjoy dinner at 22:00 hrs. Sit in front of a cozy bonfire in the garden from 22:30 hrs to 23:30 hrs playing card games. Sleep at 23:45 hrs.',
      distance: '13 km from hostel base',
      travel: '🚌 Take the public HRTC local bus from Mall Road bus stand to Solang (₹40/head, leaves at 08:15 AM) or rent a scooter (₹350/day + fuel) and split between 2 buddies (₹175 each).',
      food: '🍲 Solang Ridge Cafe - 4.2★ (Try local Himachali Siddu with ghee ₹120 and hot soupy Maggi ₹60. Avg cost: ₹180/head)',
      guide: '🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Cost: ₹1500/day split (₹187.50/head). Coordinates ticketing to avoid tourist scams and leads the waterfall trail.',
      alternatives: [
        {
          title: 'Hampta Pass Base Trek & Sethan Valley Snow Slopes',
          time: '08:00 AM - 06:00 PM',
          loc: 'Sethan Igloo Village',
          desc: 'Getting up at 06:30 hrs. Breakfast at 07:15 hrs. Board a shared 4x4 Gypsy to Sethan Valley. Hike along the snow-covered slopes of Hampta Pass base from 10:30 hrs to 14:00 hrs. Rest in the snow. Return to hostel at 16:30 hrs, sleep until evening, then have hot momos. Sit in front of the bonfire at 20:30 hrs.',
          distance: '15 km from hostel base',
          travel: '🚖 Shared local 4x4 Gypsy split between group members (₹300/head return).',
          food: '🍜 Sethan View Maggie Point - 4.2★ (Hot spiced Maggi ₹80 & Butter Tea ₹70)',
          guide: '🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Coordinates 4x4 forest permits.'
        }
      ]
    },
    { 
      day: 3, 
      title: 'Hadimba Temple Pine Forest Trail & Jogini Waterfall Hike', 
      time: '07:30 AM - 07:00 PM', 
      loc: 'Hadimba Temple & Jogini Falls', 
      desc: 'Getting up at 07:30 hrs. Pack all travel bags. Breakfast of eggs, toast, and coffee at 08:30 hrs. Hike through the pine forest to Hadimba Temple from 09:30 hrs to 11:30 hrs. Take a shared auto-rickshaw to Vashisht village, and go on a scenic trek to Jogini Waterfall from 12:30 hrs to 14:30 hrs. Enjoy late lunch at Vashisht German Bakery from 14:45 hrs to 15:45 hrs, and relax in the natural hot sulphur springs. Return to the hostel by 17:00 hrs, complete check-out, split group expenses on the split sheet, and board the evening overnight bus back home at 19:00 hrs.',
      distance: 'Hadimba Temple: 2.2 km; Jogini Falls: 4.5 km from hostel base',
      travel: '🌲 Walk through the scenic Pine Forest Trail to Hadimba (Free, 25 mins). For Jogini Falls, take a shared auto-rickshaw to Vashisht (₹30/head) and then hike 30 mins.',
      food: '🍝 Il Forno - 4.4★ (Located in a heritage wood cabin. Spinach & Ricotta Ravioli ₹380 & Apple Crumble ₹180); Vashisht German Bakery (4.1★ - Yak Cheese Sandwich ₹150)',
      guide: '🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Cost: ₹1500/day split (₹187.50/head). Guides along the uncrowded forest trails and helps with group photos.',
      alternatives: [
        {
          title: 'Naggar Castle Heritage Walk & Nicholas Roerich Gallery',
          time: '09:00 AM - 04:30 PM',
          loc: 'Naggar Town Center',
          desc: 'Getting up at 07:30 hrs. Breakfast at 08:15 hrs. Board a public bus to Naggar. Explore the historic 15th-century wood-and-stone Naggar Castle and Nicholas Roerich Art Gallery from 10:30 hrs to 13:30 hrs. Relax in the castle gardens viewing the Kullu valley. Return to hostel at 15:30 hrs.',
          distance: '21 km from hostel base',
          travel: '🚌 Public local HRTC bus from Manali Stand (₹45/head).',
          food: '🍰 Naggar Castle Cafe - 4.2★ (Try traditional local Siddu ₹120 or Walnut Cake ₹150)',
          guide: '🛡️ Local Heritage Guides available on-site (₹200 flat fee split).'
        }
      ]
    }
  ],
  Kerala: [
    { 
      day: 1, 
      title: 'Fort Kochi Art Trail, Chinese Fishing Nets & Kathakali Night', 
      time: '09:00 AM - 11:45 PM', 
      loc: 'Fort Kochi Heritage Area', 
      desc: 'Arrival at 09:00 hrs at Ernakulam station. Take a ferry to Fort Kochi, arriving at the hostel at 10:15 hrs. Check in, unpack, and rest/sleep until 13:00 hrs. Get up at 13:00 hrs. Have lunch at Kashi Art Cafe from 13:30 hrs to 14:30 hrs. Go on a guided Jew Town spice market walk and Mattancherry Palace art trail from 15:00 hrs to 17:30 hrs. Watch the sunset at the Chinese Fishing Nets. Attend the classical Kathakali dance presentation at the Kochi Cultural Center from 18:30 hrs to 20:30 hrs. Enjoy seafood dinner at Ginger House at 21:00 hrs. Sit in front of a beach campfire from 21:30 hrs to 23:30 hrs talking before sleeping.',
      distance: '1.2 km to 3.5 km walk from Fort Kochi Backpacker House',
      travel: '🚲 Rent a bicycle from the hostel (₹100/day) or take the budget public ferry from Fort Kochi jetty to Mattancherry (₹6/ticket).',
      food: '🍰 Kashi Art Cafe - 4.5★ (Famous Chocolate Cake ₹180, organic Spinach Mushroom Omelette ₹220, Cold Brew ₹150); Ginger House (4.1★ - Appam with Veg Stew ₹240)',
      guide: '🛡️ Anand (ID: AAD-ANA-4720). Aadhaar Verified. Cost: ₹1800/day split among 8 members (₹225/head). Anand is a local historian detailing colonial Fort Kochi.',
      alternatives: [
        {
          title: 'Cherai Beach Sunset Walk & Dolphin Spotting',
          time: '14:00 PM - 20:00 PM',
          loc: 'Cherai Vypin Island',
          desc: 'Waking up at 11:00 hrs. Early lunch. Take a public ferry to Vypin island, then local bus to Cherai. Go on a scenic sandy beach trek from 14:30 hrs to 17:30 hrs. Keep an eye out for humpback dolphins. Watch the sunset. Return by 19:30 hrs.',
          distance: '25 km from Fort Kochi',
          travel: '⛴️ Public ferry (₹6) followed by shared auto or local bus (₹25/head).',
          food: '🐟 Cherai Beach Resort Restaurant - 4.2★ (Try local Kerala Prawn roast ₹320)',
          guide: '🛡️ Anand (ID: AAD-ANA-4720). Aadhaar Verified.'
        }
      ]
    },
    { 
      day: 2, 
      title: 'Alleppey Backwaters Houseboat Cruise & Canal Kayaking', 
      time: '06:30 AM - 11:45 PM', 
      loc: 'Alleppey Backwater Canals', 
      desc: 'Getting up at 06:30 hrs. Breakfast of traditional Appam & Stew at 07:15 hrs. Board the public bus to Alleppey. Cruise the backwaters on a traditional houseboat from 10:30 hrs to 13:30 hrs. Enjoy lunch with local Karimeen fish on a banana leaf on the boat at 13:45 hrs. Go kayaking through narrow backwater canals from 14:30 hrs to 16:30 hrs, then return to Kochi. Rest at the hostel. Attend the Beach Food Fest from 19:00 hrs to 21:30 hrs. Have dinner at Vembanad Seafood at 22:00 hrs. Sit in front of the bonfire in the hostel courtyard from 22:30 hrs to 23:30 hrs sharing travel stories. Sleep at 23:45 hrs.',
      distance: '55 km from Ernakulam/Kochi hostel',
      travel: '🚌 Take the KSRTC public state transport bus from Ernakulam stand to Alleppey (₹60/head). Split a shared wooden government ferry (₹15/ticket) for canal transit.',
      food: '🐟 Vembanad Seafood - 4.3★ (Try traditional Karimeen Pollichathu Pearl Spot fish grilled in banana leaf ₹420 and Kappa fish curry ₹180. Avg cost: ₹300/head)',
      guide: '🛡️ Anand (ID: AAD-ANA-4720). Aadhaar Verified. Cost: ₹1800/day split (₹225/head). Coordinates boat rentals and guides kayaking safety.',
      alternatives: [
        {
          title: 'Kumarakom Bird Sanctuary Walk & Vembanad Lake Sunset Ferry',
          time: '07:00 AM - 06:30 PM',
          loc: 'Kumarakom Woodlands',
          desc: 'Getting up at 06:30 hrs. Take a bus to Kumarakom. Walk along the swamp paths of Kumarakom Bird Sanctuary from 10:00 hrs to 13:00 hrs observing migratory birds. Take a government sunset ferry across Vembanad Lake from 15:30 hrs to 17:00 hrs. Return by 18:30 hrs.',
          distance: '48 km from Fort Kochi',
          travel: '🚌 KSRTC bus to Cherthala (₹40), then shared auto to Kumarakom (₹50/head).',
          food: '🍲 Kumarakom Lake View Cafe - 4.2★ (Try local banana fritters ₹60 & spice tea ₹30)',
          guide: '🛡️ Anand (ID: AAD-ANA-4720). Aadhaar Verified. Guides through forest trails.'
        }
      ]
    },
    { 
      day: 3, 
      title: 'Varkala Beach Sunset & Coastal Cliff Walk', 
      time: '05:00 AM - 08:30 PM', 
      loc: 'Varkala Cliff and Black Sand Beach', 
      desc: 'Getting up at 05:00 hrs. Grab a quick coffee and muffin at 05:30 hrs. Board the morning express train to Varkala. Walk along the black sand beach and explore red cliffs from 11:00 hrs to 13:00 hrs. Have lunch at Darjeeling Cafe Varkala from 13:30 hrs to 14:30 hrs. Rest/nap on the beach chairs. Attend the Beach Yoga and Sunset Fest from 17:00 hrs to 19:30 hrs. Have fresh grilled seafood dinner at Clafouti Restaurant at 20:00 hrs. Complete check-out, split the group balances, and proceed to the train station.',
      distance: '160 km from Fort Kochi base',
      travel: '🚆 Take the local express train (Sleeper Class ₹145, 4 hrs) to Varkala Sivagiri Station, then split a shared auto-rickshaw to Varkala Cliff (₹30/head).',
      food: '☕ Darjeeling Cafe Varkala - 4.4★ (Seafood Platter ₹650, Honey Ginger tea ₹90, Shakshuka ₹220); Clafouti Restaurant (4.2★ - Kerala style Prawn Curry ₹380)',
      guide: '🛡️ Local Coastal Tour Guides (Aadhaar Verified, available on-demand). Group split cost: ₹1500/day total (₹187.50/head).',
      alternatives: [
        {
          title: 'Munroe Island Canoe Cruise & Mangrove Forest Paddle',
          time: '06:00 AM - 06:00 PM',
          loc: 'Munroe Island delta',
          desc: 'Getting up at 05:30 hrs. Take a train to Kollam. Take a shared auto to Munroe Island. Explore the narrow delta mangrove forests on a manually paddled canoe from 10:00 hrs to 13:00 hrs. Return to Kochi by 17:00 hrs.',
          distance: '140 km from Fort Kochi',
          travel: '🚆 Express Train to Munroe Island Station (₹120), then shared local canoe (₹250/head).',
          food: '🍲 Munroe Local Kitchen - 4.4★ (Try traditional Kozhuva/Anchovy fry ₹120)',
          guide: '🛡️ Local canoe operators (Aadhaar Verified).'
        }
      ]
    }
  ],
  Leh: [
    { 
      day: 1, 
      title: 'High-Altitude Acclimatization, Board Games & Leh Palace Sunset', 
      time: '07:30 AM - 11:45 PM', 
      loc: 'Leh Old Town Hostel', 
      desc: 'Arrival at 07:30 hrs at Leh airport. Take a cab to the hostel, checking in by 08:15 hrs. Rest/sleep completely in your dorm room until 14:00 hrs to acclimatize to the high altitude (3500m). Get up at 14:00 hrs and check oxygen saturation levels. Have lunch and hot sea buckthorn tea at German Bakery from 14:30 hrs to 15:30 hrs. Go on a very slow walk to Leh Palace from 16:00 hrs to 18:00 hrs. Attend the Ladakhi Folk Art and Music Fest at the Main Bazar from 19:00 hrs to 21:30 hrs. Have dinner at Gesmo at 21:45 hrs. Sit in front of a warm bonfire in the hostel garden from 22:00 hrs to 23:30 hrs chatting before sleeping.',
      distance: '0.8 km to 1.5 km very slow walk from hostel base',
      travel: '🚶 Mandatory slow walking (Free) to prevent acute mountain sickness (AMS). Avoid climbing stairs too quickly.',
      food: '🍰 German Bakery Leh - 4.3★ (Fresh Apricot Tart ₹120, Sea Buckthorn juice ₹90, Yak Cheese Omelette ₹180); Gesmo (4.2★ - local Ladakhi Khambir bread ₹90)',
      guide: '🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Cost: ₹2000/day split among 8 members (₹250/head). Tashi is a wilderness medic; checks oxygen saturation levels.',
      alternatives: [
        {
          title: 'Spituk Gompa Monastery Walk & Indus Valley Sunset view',
          time: '13:00 PM - 18:30 PM',
          loc: 'Spituk Hilltop',
          desc: 'Rest completely until 13:00 hrs. Walk slowly down to Spituk Gompa from 14:30 hrs to 17:00 hrs. Climb the low hill to Spituk monastery overlooking the airport runway and Indus river. Enjoy panoramic sunset. Return at 18:00 hrs.',
          distance: '7 km from Leh town base',
          travel: '🚌 Local shared mini-bus from Leh Bazar (₹20/head).',
          food: '☕ Spituk tea room - 4.1★ (Hot butter tea ₹30 & wheat cookies)',
          guide: '🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Wilderness safety responder.'
        }
      ]
    },
    { 
      day: 2, 
      title: 'Gravity-Defying Magnetic Hill, Sangam Confluence & Alchi Kitchen', 
      time: '07:30 AM - 11:45 PM', 
      loc: 'Magnetic Hill & Sangam Confluence', 
      desc: 'Getting up at 07:30 hrs. Check oxygen levels. Have local Ladakhi bread (Khambir) and apricot jam at 08:30 hrs. Board a shared SUV. Visit Magnetic Hill, then go on a scenic walking tour along the Indus-Zanskar confluence (Sangam) from 10:30 hrs to 13:30 hrs. Have local lunch and attend a cooking workshop at Alchi Kitchen from 14:00 hrs to 16:00 hrs. Return and rest at the hostel. Attend the Himalayan Acoustic Music and Starry night fest from 18:30 hrs to 21:00 hrs. Have dinner at The Tibetan Kitchen at 21:30 hrs. Sit in front of the bonfire from 22:00 hrs to 23:30 hrs playing guitar under the stars. Sleep at 23:45 hrs.',
      distance: '28 km to 50 km from Leh town center',
      travel: '🚖 Hire a shared Mahindra Bolero SUV via Leh Taxi Union and split the cost between 8 members (₹450 per head return).',
      food: '🥟 Alchi Kitchen - 4.6★ (Famous traditional pasta soup Chutagi ₹280 and sweet Apricot Mokmok dumplings ₹180. Avg cost: ₹230/head)',
      guide: '🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Cost: ₹2000/day split (₹250/head). Manages vehicle union check-posts and leads the Zanskar river walk.',
      alternatives: [
        {
          title: 'Thiksey Gompa Morning prayers & Shey Palace Trail',
          time: '05:30 AM - 02:00 PM',
          loc: 'Thiksey Hilltop monastery',
          desc: 'Getting up at 05:00 hrs. Drive to Thiksey Monastery to attend the sunrise prayers and chanting of monk novices at 06:00 hrs. Hike the historical Shey Palace ruins from 09:30 hrs to 12:00 hrs. Return for late lunch at Leh Bazar.',
          distance: '19 km from Leh town base',
          travel: '🚖 Shared local taxi booked via union (₹300 per head split).',
          food: '🍲 Thiksey Cafe - 4.3★ (Try hot Thukpa noodle soup ₹140)',
          guide: '🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified.'
        }
      ]
    },
    { 
      day: 3, 
      title: 'Pangong Tso High-Altitude Saltwater Lake & Shanti Stupa Sunset', 
      time: '04:30 AM - 09:30 PM', 
      loc: 'Pangong Tso & Shanti Stupa', 
      desc: 'Getting up at 04:30 hrs. Quick breakfast of boiled eggs and hot butter tea at 05:00 hrs. Long drive crossing Chang La Pass. Go on a shoreline trek along Pangong Lake from 11:00 hrs to 13:30 hrs. Have lunch at Pangong Lake View Camp from 13:45 hrs to 14:45 hrs. Drive back to Leh town. Walk up the stairs to Shanti Stupa for the sunset view from 18:30 hrs to 19:30 hrs. Have dinner of mutton momos at The Tibetan Kitchen at 20:00 hrs, complete check-out, split the trip balances, and prepare for departure.',
      distance: '220 km from Leh town base',
      travel: '🚖 Shared Toyota Innova SUV split between 8 members (₹1800 per head return). Shanti Stupa is a 20-min climb up 500 stairs from Leh center (Free).',
      food: '🍜 Pangong Lake View Camp - 4.1★ (Hot Soupy Maggi ₹80 & Tibetan Thukpa ₹160); The Tibetan Kitchen Leh (4.5★ - steamed Mutton Momos ₹240, Tingmo steamed bread ₹60)',
      guide: '🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Cost: ₹2000/day split (₹250/head). Manages border inner-line permits (ILPs) and monitors medical health kits.',
      alternatives: [
        {
          title: 'Khardung La Pass Highest Motorable Road Excursion',
          time: '07:30 AM - 02:00 PM',
          loc: 'Khardung La Pass (5359m)',
          desc: 'Getting up at 06:30 hrs. Breakfast at 07:15 hrs. Board shared taxi up the Khardung La Pass. Take pictures at the world\'s highest motorable pass sign board at 10:00 hrs. Drive back down to Leh town by 13:00 hrs. Late lunch.',
          distance: '40 km from Leh town base',
          travel: '🚖 Shared SUV split between 8 members (₹500 per head return).',
          food: '🍵 Rinchen Cafe Khardung La - 4.0★ (Try black ginger tea ₹40 & vegetable noodles)',
          guide: '🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Manages high-altitude portable oxygen cylinders.'
        }
      ]
    }
  ]
};

function handleSwapActivity(dest, day, selectedTitle) {
  if (!selectedTitle) return;
  const list = itineraries[dest];
  const item = list.find(x => x.day === day);
  if (!item) return;

  const altIndex = item.alternatives.findIndex(x => x.title === selectedTitle);
  if (altIndex === -1) return;

  // Preserve the current main activity
  const currentMain = {
    title: item.title,
    time: item.time,
    loc: item.loc,
    desc: item.desc,
    distance: item.distance,
    travel: item.travel,
    food: item.food,
    guide: item.guide
  };

  const chosenAlt = item.alternatives[altIndex];

  // Overwrite main with chosen alternative
  item.title = chosenAlt.title;
  item.time = chosenAlt.time;
  item.loc = chosenAlt.loc;
  item.desc = chosenAlt.desc;
  item.distance = chosenAlt.distance;
  item.travel = chosenAlt.travel;
  item.food = chosenAlt.food;
  item.guide = chosenAlt.guide;

  // Place old main back in alternatives
  item.alternatives[altIndex] = currentMain;

  showToast(`Swapped Day ${day} activity with: ${item.title}!`, 'success');
  loadItineraryTemplate(dest);
}

function loadItineraryTemplate(dest) {
  const container = document.getElementById('itinerary-view');
  const tabs = document.querySelectorAll('.itinerary-tab');
  
  // Set active tab styling
  tabs.forEach(tab => {
    if (tab.innerText.toLowerCase().includes(dest.toLowerCase())) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  const list = itineraries[dest] || [];
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<p class="empty-state">No itinerary details loaded.</p>';
    return;
  }

  // Generate Tabular view
  const tableDiv = document.createElement('div');
  tableDiv.className = 'table-responsive';

  let tableHtml = `
    <table class="itinerary-table">
      <thead>
        <tr>
          <th style="width: 10%;">Day / Time</th>
          <th style="width: 18%;">Place & Activity</th>
          <th style="width: 32%;">Detailed Schedule & Description</th>
          <th style="width: 18%;">Distance & Budget Transit</th>
          <th style="width: 12%;">Food Suggestion</th>
          <th style="width: 10%;">Guide & Swaps</th>
        </tr>
      </thead>
      <tbody>
  `;

  list.forEach(item => {
    let selectOptions = `<option value="">-- Swap Vibe --</option>`;
    if (item.alternatives && item.alternatives.length > 0) {
      item.alternatives.forEach(alt => {
        selectOptions += `<option value="${alt.title}">🔄 ${alt.title.substring(0, 30)}...</option>`;
      });
    }

    tableHtml += `
      <tr>
        <td style="font-weight: 800; color: var(--accent-rose);">
          Day ${item.day}<br>
          <span style="font-size: 10px; color: #6b7280; font-weight: normal;">${item.time}</span>
        </td>
        <td style="font-weight: 700; color: #1e1b4b;">
          ${item.title}<br>
          <span style="font-size: 10px; color: #06b6d4; font-weight: 600;"><i class="fa-solid fa-location-dot"></i> ${item.loc}</span>
        </td>
        <td style="line-height: 1.4; font-size: 11px;">
          ${item.desc}
        </td>
        <td style="font-size: 11px; color: #4b5563;">
          <strong>Distance:</strong> ${item.distance || 'Base'}<br>
          <span style="display: block; margin-top: 4px; font-size: 10px; color: #10b981;">${item.travel || ''}</span>
        </td>
        <td style="font-size: 10px; color: #ef4444; line-height: 1.3;">
          ${item.food || 'On-demand local food'}
        </td>
        <td>
          <span style="font-size: 10px; display: block; margin-bottom: 6px; color: #8b5cf6;">${item.guide ? '🛡️ Verified Guide' : 'On-demand'}</span>
          ${item.alternatives && item.alternatives.length > 0 ? `
            <select class="swap-select" onchange="handleSwapActivity('${dest}', ${item.day}, this.value)">
              ${selectOptions}
            </select>
          ` : '<span style="color: #9ca3af; font-size: 10px;">None</span>'}
        </td>
      </tr>
    `;
  });

  tableHtml += `
      </tbody>
    </table>
  `;

  tableDiv.innerHTML = tableHtml;
  container.appendChild(tableDiv);
}

// ============================================================
// COMPATIBILITY SIMULATOR ENGINE (100 PROFILES MATCHING)
// ============================================================
let currentQuizStep = 0;
let userAnswers = {};
let simulatorProfiles = [];

const mockNames = [
  "Aarav Sharma", "Aditi Patel", "Amit Verma", "Ananya Iyer", "Arjun Rao", 
  "Anika Mehta", "Sara Agarwal", "Rohan Kaur", "Anand Nair", "Vikram Sen",
  "Priya Gupta", "Siddharth Das", "Ishita Roy", "Kabir Singh", "Riya Malhotra",
  "Rahul Joshi", "Meera Bose", "Devendra Mishra", "Nisha Saxena", "Rohan Verma",
  "Neha Kapur", "Varun Dhawan", "Kriti Sanon", "Akshay Kumar", "Ranbir Kapoor",
  "Alia Bhatt", "Deepika Padukone", "Ranveer Singh", "Priyanka Chopra", "Nick Jonas",
  "Shah Rukh Khan", "Salman Khan", "Aamir Khan", "Katrina Kaif", "Vicky Kaushal",
  "Kiara Advani", "Sidharth Malhotra", "Shraddha Kapoor", "Rajkummar Rao", "Ayushmann Khurrana",
  "Bhumi Pednekar", "Taapsee Pannu", "Karthik Aaryan", "Sara Ali Khan", "Janhvi Kapoor",
  "Ishaan Khatter", "Ananya Panday", "Vijay Deverakonda", "Rashmika Mandanna", "Samantha Ruth",
  "Nayanthara", "Dulquer Salmaan", "Fahadh Faasil", "Prithviraj Sukumaran", "Tovino Thomas",
  "Nivin Pauly", "Yash", "Rishab Shetty", "Rakshit Shetty", "Sudeep",
  "Darshan", "Puneeth Rajkumar", "Shiva Rajkumar", "Upendra", "Ganesh",
  "Vijay", "Ajith Kumar", "Dhanush", "Suriya", "Vikram",
  "Karthi", "Jayam Ravi", "Simbu", "Vijay Sethupathi", "Sivakarthikeyan",
  "Mahesh Babu", "Allu Arjun", "Ram Charan", "NTR Jr", "Prabhas",
  "Pawan Kalyan", "Chiranjeevi", "Balakrishna", "Nagarjuna", "Venkatesh",
  "Nani", "Vijay Deverakonda", "Dulquer Salmaan", "Fahadh Faasil", "Prithviraj Sukumaran",
  "Rajinikanth", "Kamal Haasan", "Mohanlal", "Mammootty", "Suresh Gopi",
  "Jayaram", "Dileep", "Kunchacko Boban", "Jayasurya", "Asif Ali"
];

const mockTravelStyles = ["Photography 📷", "Adventure 🧗", "Food 🍲", "Heritage 🏛️", "Wildlife 🐯", "Trekking 🌲", "Budget Wanderer 🎒", "Luxury Seeker 💎"];
const mockCities = ["Mumbai", "Delhi", "Pune", "Bangalore", "Chennai", "Kolkata", "Hyderabad", "Kochi", "Jaipur", "Ahmedabad"];

const quizQuestions = [
  {
    key: 'destination',
    title: '🌲 What is your ideal destination escape?',
    choices: [
      { text: 'Scenic Misty Mountains & Peaks', emoji: '🌲', val: 'Mountains' },
      { text: 'Sun-kissed Beaches & Ocean Waves', emoji: '🏖️', val: 'Beaches' }
    ]
  },
  {
    key: 'nightlife',
    title: '🔥 How do you want to spend your nights?',
    choices: [
      { text: 'Acoustic Music & Cozy Bonfire', emoji: '🔥', val: 'Bonfire' },
      { text: 'High-energy Clubs & Music Festivals', emoji: '🪩', val: 'Clubs' }
    ]
  },
  {
    key: 'pace',
    title: '🏃 What is your preferred travel pace?',
    choices: [
      { text: 'Action-packed Adventure & Trekking', emoji: '🏃', val: 'Adventure' },
      { text: 'Slow, Relaxing Spa & Cafe Hopping', emoji: '🧘', val: 'Relaxation' }
    ]
  },
  {
    key: 'budget',
    title: '🚌 What is your transit & accommodation vibe?',
    choices: [
      { text: 'Local State Transit & Budget Backpacker Hostels', emoji: '🚌', val: 'Budget' },
      { text: 'Shared Comfortable SUVs & Luxury/Mid Comfort Stay', emoji: '🚖', val: 'High' }
    ]
  },
  {
    key: 'social',
    title: '🤝 What is your group size expectation?',
    choices: [
      { text: 'Small Quiet Circle (2-4 companions)', emoji: '🤝', val: 'Small' },
      { text: 'Large Lively Party Crew (6-12 companions)', emoji: '🎉', val: 'Large' }
    ]
  }
];

function generateMockProfiles() {
  const list = [];
  for (let i = 0; i < 100; i++) {
    const style = mockTravelStyles[i % mockTravelStyles.length];
    const city = mockCities[i % mockCities.length];
    list.push({
      id: `mock-${i}`,
      name: mockNames[i % mockNames.length],
      age: 20 + (i % 20),
      gender: i % 2 === 0 ? 'F' : 'M',
      city: city,
      style: style,
      preferences: {
        destination: i % 3 === 0 ? 'Beaches' : 'Mountains',
        nightlife: i % 2 === 0 ? 'Bonfire' : 'Clubs',
        pace: i % 4 === 0 ? 'Relaxation' : 'Adventure',
        budget: i % 5 === 0 ? 'High' : 'Budget',
        social: i % 3 === 2 ? 'Large' : 'Small'
      },
      trustScore: parseFloat((0.85 + (i % 15) * 0.01).toFixed(2))
    });
  }
  return list;
}

function initMatchingSimulator() {
  simulatorProfiles = generateMockProfiles();
  currentQuizStep = 0;
  userAnswers = {};
  renderSimulatorStart();
}

function renderSimulatorStart() {
  const frame = document.getElementById('sim-phone-frame');
  if (!frame) return;

  frame.innerHTML = `
    <div class="sim-quiz-wrap">
      <div class="sim-quiz-header">
        <span class="sim-quiz-badge">Compatibility Test</span>
        <h2 class="sim-quiz-question">Ready to find your companion crew?</h2>
      </div>
      <p style="font-size: 11px; text-align: center; color: rgba(255,255,255,0.6); margin-top: 15px; line-height: 1.4;">
        We will match your preferences against 100 active traveler profiles on the engine using our similarity matrix.
      </p>
      <div class="sim-quiz-choices" style="margin-top: 30px;">
        <button class="sim-choice-btn" onclick="startSimQuiz()" style="justify-content: center; width: 100%;">
          <span class="sim-choice-emoji">🚀</span> Start Compatibility Test
        </button>
      </div>
      <div class="sim-quiz-footer">
        <div class="sim-quiz-meta">Takes less than 1 minute</div>
      </div>
    </div>
  `;
}

window.startSimQuiz = function() {
  currentQuizStep = 0;
  userAnswers = {};
  renderQuizQuestion();
};

function renderQuizQuestion() {
  const frame = document.getElementById('sim-phone-frame');
  if (!frame) return;

  const question = quizQuestions[currentQuizStep];
  frame.innerHTML = `
    <div class="sim-quiz-wrap">
      <div class="sim-quiz-header">
        <span class="sim-quiz-badge">Question ${currentQuizStep + 1} of 5</span>
        <h2 class="sim-quiz-question">${question.title}</h2>
      </div>
      <div class="sim-quiz-choices">
        ${question.choices.map((choice) => `
          <button class="sim-choice-btn" onclick="answerQuizQuestion('${question.key}', '${choice.val}')">
            <span class="sim-choice-emoji">${choice.emoji}</span>
            <span>${choice.text}</span>
          </button>
        `).join('')}
      </div>
      <div class="sim-quiz-footer">
        <div class="sim-quiz-bar-bg">
          <div class="sim-quiz-bar-fill" style="width: ${(currentQuizStep / 5) * 100}%"></div>
        </div>
        <div class="sim-quiz-meta">${5 - currentQuizStep} questions remaining</div>
      </div>
    </div>
  `;
}

window.answerQuizQuestion = function(key, val) {
  userAnswers[key] = val;
  currentQuizStep++;
  
  if (currentQuizStep < quizQuestions.length) {
    renderQuizQuestion();
  } else {
    triggerMatchingSequence();
  }
};

const loaderSteps = [
  { title: "Destination Filter Active", sub: "Filtering out incompatible destination types..." },
  { title: "Date Overlap Check", sub: "Checking active calendar dates for all 100 profiles..." },
  { title: "Budget Tier Matching", sub: "Aligning low, mid, and high budgets..." },
  { title: "Social and Vibe Optimizer", sub: "Calculating group sizing compatibility..." },
  { title: "ML Similarity Scoring", sub: "Running distance matrices for top companions..." }
];

function triggerMatchingSequence() {
  const frame = document.getElementById('sim-phone-frame');
  if (!frame) return;

  let currentLoaderIndex = 0;

  function showNextLoaderStep() {
    if (currentLoaderIndex < loaderSteps.length) {
      const step = loaderSteps[currentLoaderIndex];
      frame.innerHTML = `
        <div class="sim-loader-wrap">
          <div class="sim-spinner"></div>
          <div class="sim-loader-title">${step.title}</div>
          <div class="sim-loader-sub">${step.sub}</div>
        </div>
      `;
      currentLoaderIndex++;
      setTimeout(showNextLoaderStep, 700);
    } else {
      calculateAndDisplayMatches();
    }
  }

  showNextLoaderStep();
}

function calculateAndDisplayMatches() {
  const frame = document.getElementById('sim-phone-frame');
  if (!frame) return;

  // Process similarity against all 100 profiles
  simulatorProfiles.forEach(p => {
    let matches = 0;
    if (p.preferences.destination === userAnswers.destination) matches++;
    if (p.preferences.nightlife === userAnswers.nightlife) matches++;
    if (p.preferences.pace === userAnswers.pace) matches++;
    if (p.preferences.budget === userAnswers.budget) matches++;
    if (p.preferences.social === userAnswers.social) matches++;

    p.matchPercent = Math.round(55 + (matches / 5) * 40 + (p.trustScore * 5));
    if (p.matchPercent > 100) p.matchPercent = 100;
  });

  // Sort descending by match percentage, then trust score
  simulatorProfiles.sort((a, b) => b.matchPercent - a.matchPercent || b.trustScore - a.trustScore);
  const topMatches = simulatorProfiles.slice(0, 5);

  frame.innerHTML = `
    <div class="sim-sb">
      <span>9:41</span>
      <span style="display:flex;gap:5px;align-items:center;">
        <i class="fa-solid fa-wifi" style="font-size:10px;color:#fff;"></i>
        <i class="fa-solid fa-battery-three-quarters" style="font-size:10px;color:#fff;"></i>
      </span>
    </div>

    <!-- HERO -->
    <div class="sim-hero">
      <div class="sim-hero-bg"></div>
      <div class="sim-hero-content">
        <div class="sim-back-row">
          <button class="sim-back-btn" onclick="restartSimQuiz()"><i class="fa-solid fa-arrow-rotate-left"></i></button>
          <span class="sim-screen-lbl">Matched Crew</span>
        </div>
        <div class="sim-dest-row">
          <div class="sim-dest-emoji-wrap">
            <div class="sim-dest-emoji-ring"></div>
            <span class="sim-dest-emoji">${userAnswers.destination === 'Mountains' ? '🌲' : '🏖️'}</span>
          </div>
          <div class="sim-dest-info">
            <div class="sim-dest-name">${userAnswers.destination === 'Mountains' ? 'Manali Peaks' : 'Goa Beaches'}</div>
            <div class="sim-dest-sub">Dec 20 – 27, 2026 · 7 nights</div>
            <div class="sim-budget-pill"><i class="fa-solid fa-indian-rupee-sign"></i> ${userAnswers.budget === 'High' ? 'Mid/Luxury Vibe' : 'Budget Backpacker'}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAGS -->
    <div class="sim-tags-row">
      <span class="sim-tag sim-tag-purple"><i class="fa-solid fa-location-dot"></i> ${userAnswers.destination}</span>
      <span class="sim-tag sim-tag-pink"><i class="fa-solid fa-fire"></i> ${userAnswers.nightlife}</span>
      <span class="sim-tag sim-tag-teal"><i class="fa-solid fa-person-running"></i> ${userAnswers.pace}</span>
      <span class="sim-tag sim-tag-amber"><i class="fa-solid fa-wallet"></i> ${userAnswers.budget === 'High' ? 'Comfort' : 'Budget'}</span>
    </div>

    <!-- BODY -->
    <div class="sim-body">
      <!-- Crew Section -->
      <div class="sim-card">
        <div class="sim-section-head">
          <span class="sim-s-title">Your crew (${topMatches.length} members)</span>
          <span class="sim-s-link" onclick="restartSimQuiz()">Retake</span>
        </div>
        <div class="sim-crew-avatars">
          ${topMatches.map((m, idx) => {
            const colors = ['sim-av-a', 'sim-av-b', 'sim-av-c', 'sim-av-d', 'sim-av-more'];
            const color = colors[idx % colors.length];
            const initials = m.name.split(' ').map(n => n[0]).join('');
            return `<span class="sim-av ${color}">${initials}</span>`;
          }).join('')}
          <span class="sim-crew-label">All verified</span>
        </div>
        
        <div class="sim-member-list">
          ${topMatches.slice(0, 3).map((m, idx) => {
            const colors = ['sim-av-a', 'sim-av-b', 'sim-av-c'];
            const color = colors[idx % colors.length];
            const initials = m.name.split(' ').map(n => n[0]).join('');
            return `
              <div class="sim-member-row">
                <div class="sim-m-av ${color}">${initials}</div>
                <div class="sim-m-info">
                  <div class="sim-m-name">${m.name}</div>
                  <div class="sim-m-tag">${m.style} · ${m.city}</div>
                </div>
                <div class="sim-verified-dot"></div>
                <div class="sim-m-score"><i class="fa-solid fa-star"></i>${m.matchPercent}%</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Compatibility Bars Section (For first match) -->
      <div class="sim-card">
        <div class="sim-section-head">
          <span class="sim-s-title">Compatibility · ${topMatches[0].name.split(' ')[0]}</span>
          <span class="sim-s-link" style="color:#4ade80;font-weight:800;">${topMatches[0].matchPercent}% match</span>
        </div>
        <div class="sim-compat-bars">
          <div class="sim-bar-row">
            <span class="sim-bar-lbl">Destination</span>
            <div class="sim-bar-track"><div class="sim-bar-fill" style="width: 100%; background: linear-gradient(90deg,#7c3aed,#c084fc);"></div></div>
            <span class="sim-bar-pct">100%</span>
          </div>
          <div class="sim-bar-row">
            <span class="sim-bar-lbl">Nightlife</span>
            <div class="sim-bar-track"><div class="sim-bar-fill" style="width: ${topMatches[0].preferences.nightlife === userAnswers.nightlife ? '100' : '50'}%; background: linear-gradient(90deg,#db2777,#f472b6);"></div></div>
            <span class="sim-bar-pct">${topMatches[0].preferences.nightlife === userAnswers.nightlife ? '100' : '50'}%</span>
          </div>
          <div class="sim-bar-row">
            <span class="sim-bar-lbl">Travel style</span>
            <div class="sim-bar-track"><div class="sim-bar-fill" style="width: ${topMatches[0].preferences.pace === userAnswers.pace ? '100' : '40'}%; background: linear-gradient(90deg,#0d9488,#2dd4bf);"></div></div>
            <span class="sim-bar-pct">${topMatches[0].preferences.pace === userAnswers.pace ? '100' : '40'}%</span>
          </div>
          <div class="sim-bar-row">
            <span class="sim-bar-lbl">Budget fit</span>
            <div class="sim-bar-track"><div class="sim-bar-fill" style="width: ${topMatches[0].preferences.budget === userAnswers.budget ? '100' : '60'}%; background: linear-gradient(90deg,#059669,#4ade80);"></div></div>
            <span class="sim-bar-pct">${topMatches[0].preferences.budget === userAnswers.budget ? '100' : '60'}%</span>
          </div>
          <div class="sim-bar-row">
            <span class="sim-bar-lbl">Trust score</span>
            <div class="sim-bar-track"><div class="sim-bar-fill" style="width: ${topMatches[0].trustScore * 100}%; background: linear-gradient(90deg,#d97706,#fbbf24);"></div></div>
            <span class="sim-bar-pct">${Math.round(topMatches[0].trustScore * 100)}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="sim-cta-wrap">
      <button class="sim-cta" onclick="triggerSimConfirm(this)">
        <div class="sim-cta-ripple"></div>
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        Confirm and join crew
      </button>
    </div>
    <div class="sim-confetti-layer" id="sim-confetti-layer"></div>
  `;

  // Draw compatibility bars width transitionally
  setTimeout(() => {
    document.querySelectorAll('.sim-bar-fill').forEach(bar => {
      const parentStyle = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = parentStyle;
      }, 50);
    });
  }, 100);
}

window.restartSimQuiz = function() {
  initMatchingSimulator();
};

window.triggerSimConfirm = function(btn) {
  const layer = document.getElementById('sim-confetti-layer');
  if (!layer) return;

  layer.innerHTML = '';
  const colors = ['#c084fc', '#f472b6', '#4ade80', '#fbbf24', '#60a5fa', '#f87171'];
  
  for (let i = 0; i < 35; i++) {
    const cf = document.createElement('div');
    cf.className = 'sim-cf';
    cf.style.cssText = `
      left: ${10 + Math.random() * 80}%;
      background: ${colors[i % colors.length]};
      animation-delay: ${Math.random() * 0.5}s;
      animation-duration: ${1.2 + Math.random() * 0.6}s;
    `;
    layer.appendChild(cf);
  }

  showToast('Welcome to the crew! Matching optimization successfully completed.', 'success');

  // Disable button and update text
  btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> You have joined this crew!';
  btn.disabled = true;
  btn.style.background = 'linear-gradient(90deg, #10b981, #059669)';

  setTimeout(() => {
    layer.innerHTML = '';
  }, 3000);
};

// ============================================================
// BIOMETRIC FACE AUTHENTICATION & SAME-DAY EXPEDITIONS BOARD
// ============================================================
let webcamStreamTrack = null;
let biometricSuccessCallback = null;
let activeExpeditionGroups = [];

let isLivenessScanning = false;

window.startFaceBiometricScan = function(onSuccess) {
  if (isLivenessScanning) return;
  isLivenessScanning = true;

  biometricSuccessCallback = onSuccess;
  
  // Show Modal
  const modal = document.getElementById('face-auth-modal');
  if (modal) modal.classList.remove('hidden');

  // Reset status indicators
  const overlay = document.getElementById('biometric-loading-overlay');
  const title = document.getElementById('biometric-status-title');
  const desc = document.getElementById('biometric-status-desc');
  const instruction = document.getElementById('liveness-instruction');
  const video = document.getElementById('webcam-stream');

  overlay.classList.remove('hidden');
  title.innerText = 'Initializing Cam...';
  desc.innerText = 'Requesting system media permissions';
  instruction.innerHTML = 'Position face in camera ring to begin.';

  // Attempt stream capture
  navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 } })
    .then(stream => {
      video.srcObject = stream;
      webcamStreamTrack = stream.getTracks()[0];
      
      // Let stream warm up, then run liveness steps
      setTimeout(() => {
        overlay.classList.add('hidden');
        runLivenessScanningSequence();
      }, 1000);
    })
    .catch(err => {
      console.warn('[Biometric] Camera access refused or unavailable, falling back to simulated sensor.', err);
      // Sandbox/headless fallback - simulate capture with beautiful CSS overlays
      desc.innerText = 'No physical camera detected. Running Biometric simulator...';
      setTimeout(() => {
        overlay.classList.add('hidden');
        runLivenessScanningSequence();
      }, 1200);
    });
};

async function runLivenessScanningSequence() {
  const instruction = document.getElementById('liveness-instruction');
  const overlay = document.getElementById('biometric-loading-overlay');
  const title = document.getElementById('biometric-status-title');
  const desc = document.getElementById('biometric-status-desc');
  const video = document.getElementById('webcam-stream');
  const container = video.parentElement;

  // Reset state
  container.className = 'webcam-container state-waiting';
  
  const challengeMap = {
    'blink': 'Please blink your eyes slowly.',
    'head_right': 'Please slowly turn your head to the right.',
    'head_left': 'Please slowly turn your head to the left.',
    'smile': 'Please give a natural smile.',
    'nod': 'Please slowly nod your head up and down.',
    'turn_head_left': 'Please slowly turn your head to the left.',
    'turn_head_right': 'Please slowly turn your head to the right.'
  };

  const captureFrame = () => {
    if(video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Check brightness (BUG 1)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let r = 0, g = 0, b = 0;
    const len = imgData.data.length;
    for (let i = 0; i < len; i += 4) {
      r += imgData.data[i];
      g += imgData.data[i+1];
      b += imgData.data[i+2];
    }
    const pixelCount = len / 4;
    const avgBrightness = (r + g + b) / (3 * pixelCount);
    
    if (avgBrightness < 40) {
      return 'TOO_DARK';
    }
    
    return canvas.toDataURL('image/jpeg', 0.5);
  };

  try {
    // STATE 1: WAITING
    instruction.innerHTML = `🛡️ <strong>Step 1:</strong> Position your face in the centre ring and hold still.`;
    
    let faceDetected = false;
    let attempts = 0;
    
    // Wait for face presence
    while (!faceDetected && attempts < 40) {
      attempts++;
      await new Promise(r => setTimeout(r, 500));
      const frame = captureFrame();
      if (frame === 'TOO_DARK') {
        instruction.innerHTML = `<span style="color:#ef4444; font-weight:bold;">Your environment is too dark. Move to a brighter area or turn on a light.</span>`;
        container.className = 'webcam-container state-error';
        return;
      }
      if (!frame) continue;

      const checkRes = await apiFetch(`${API_BASE}/safety/check-face`, {
        method: 'POST',
        body: JSON.stringify({ frame })
      });
      if (checkRes.ok) {
        const data = await checkRes.json();
        faceDetected = data.faceDetected;
      } else {
        console.error('Check face endpoint failed:', checkRes.status, await checkRes.text());
      }
    }

    if (!faceDetected) {
      throw new Error('Could not detect a face. Please try again.');
    }

    // STATE 2: FACE_DETECTED
    container.className = 'webcam-container state-detected';
    instruction.innerHTML = `<span style="color:#3b82f6; font-weight:bold;">Face detected. Hold still...</span>`;
    await new Promise(r => setTimeout(r, 1500));

    // STATE 3: CHALLENGE
    container.className = 'webcam-container state-challenge';
    const challengeRes = await apiFetch(`${API_BASE}/safety/verify-kyc/challenge`);
    if (!challengeRes.ok) throw new Error('Failed to fetch challenge');
    const challenge = await challengeRes.json();
    
    const label = challengeMap[challenge.action] || 'Please follow the on-screen instruction.';
    instruction.innerHTML = `🛡️ <strong>Liveness Challenge:</strong> ${label}`;
    
    const frames = [];
    const captureInterval = setInterval(() => {
      const frame = captureFrame();
      if (frame && frame !== 'TOO_DARK') frames.push(frame);
    }, 300);

    // Capture for 4 seconds to give user time to read and react
    await new Promise(r => setTimeout(r, 4000));
    clearInterval(captureInterval);

    // STATE 4: VERIFYING
    container.className = 'webcam-container state-verifying';
    instruction.innerHTML = `Verifying... please wait.`;
    overlay.classList.remove('hidden');
    title.innerText = 'Verifying Landmarks...';
    desc.innerText = 'Running ML Face Detection on server...';
    
    const verifyRes = await apiFetch(`${API_BASE}/safety/verify-liveness-only`, {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: challenge.challenge_id,
        selfie_frames: frames
      })
    });
    
    const verifyData = await verifyRes.json();
    
    // STATE 5: SUCCESS/FAIL
    if (verifyRes.ok && verifyData.verification_status === 'verified') {
      container.className = 'webcam-container state-success';
      title.innerText = 'Authentication Success!';
      desc.innerHTML = `<span style="color:#4ade80; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> ML VERIFIED (${(verifyData.confidence * 100).toFixed(1)}% Confidence)</span>`;
      instruction.innerHTML = `<span style="color:var(--success); font-weight:bold;">Authentication Complete! Opening TravelMate.</span>`;
      setTimeout(() => {
        closeFaceAuthModal();
        if (biometricSuccessCallback) biometricSuccessCallback();
      }, 1200);
    } else {
      throw new Error(verifyData.message || verifyData.error || 'Face verification failed');
    }

  } catch (err) {
    console.error(err);
    container.className = 'webcam-container state-error';
    if (overlay) overlay.classList.add('hidden');
    const msg = err.message || 'Error initializing scanner. Check server connection.';
    instruction.innerHTML = `<span style="color:#ef4444; font-weight:bold;"><i class="fa-solid fa-circle-xmark"></i> ${msg}</span>`;
  }
}

window.closeFaceAuthModal = function() {
  isLivenessScanning = false;
  const modal = document.getElementById('face-auth-modal');
  if (modal) modal.classList.add('hidden');
  
  // If they cancel out during login flow before tokens are persisted, reset memory token
  if (!localStorage.getItem('tm_access_token')) {
    accessToken = '';
  }

  // Stop camera tracks
  if (webcamStreamTrack) {
    try {
      webcamStreamTrack.stop();
    } catch (e) {}
    webcamStreamTrack = null;
  }
  
  const video = document.getElementById('webcam-stream');
  if (video) video.srcObject = null;
};

// 50+ EXPEDITIONS BOARD GENERATOR
const mockAdjectives = ["Misty", "Wilderness", "Backwater", "Spiritual", "Acoustic", "Adventure", "Vibrant", "Hidden", "Heritage", "Premium"];
const mockGroupNouns = ["Caravan", "Expedition", "Explorer Club", "Getaway", "Vibe Tribe", "Trek Group", "Wanderers", "Squad", "Nomads", "Squadron"];
const mockThemes = ["Adventure", "Beach", "Heritage", "Food"];
const mockDestinations = ["Manali", "Kerala", "Leh"];
const mockBudgets = ["Low", "Mid", "High"];

function generate50ExpeditionGroups() {
  const list = [];
  const today = new Date();
  
  for (let i = 1; i <= 55; i++) {
    const dest = mockDestinations[i % mockDestinations.length];
    const budget = mockBudgets[i % mockBudgets.length];
    const theme = mockThemes[i % mockThemes.length];
    const adj = mockAdjectives[i % mockAdjectives.length];
    const noun = mockGroupNouns[i % mockGroupNouns.length];
    const title = `${adj} ${dest} ${noun}`;
    
    // slots logic
    const capacity = 8;
    const filled = i % capacity === 0 ? capacity : (i % 6) + 1; // some groups are full, some open
    
    list.push({
      id: `exp-group-${i}`,
      title: title,
      destination: dest,
      budget: budget,
      theme: theme,
      filledSlots: filled,
      maxCapacity: capacity,
      departureDate: today.toISOString().split('T')[0],
      guideName: i % 2 === 0 ? "🛡️ Vikram Sen (Verified)" : "🛡️ Anand Nair (Verified)",
      trustRequirement: (0.75 + (i % 20) * 0.01).toFixed(2)
    });
  }
  return list;
}

window.filterExpeditions = function() {
  const destVal = document.getElementById('exp-filter-dest').value;
  const budgetVal = document.getElementById('exp-filter-budget').value;
  const themeVal = document.getElementById('exp-filter-theme').value;
  const grid = document.getElementById('expedition-groups-grid');

  if (!grid) return;
  grid.innerHTML = '';

  const filtered = activeExpeditionGroups.filter(g => {
    if (destVal && g.destination !== destVal) return false;
    if (budgetVal && g.budget !== budgetVal) return false;
    if (themeVal && g.theme !== themeVal) return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="empty-state" style="grid-column: 1/-1;">No group matches found. Try clearing filters.</p>`;
    return;
  }

  filtered.forEach(g => {
    const card = document.createElement('div');
    card.className = 'expedition-group-card';
    
    const themeClass = `theme-${g.theme.toLowerCase()}`;
    const slotsClass = g.filledSlots >= g.maxCapacity ? 'slots-full' : 'slots-available';
    const slotsText = g.filledSlots >= g.maxCapacity ? 'Group Full' : `${g.maxCapacity - g.filledSlots} seats open`;
    
    card.innerHTML = `
      <div>
        <div class="expedition-header">
          <span class="expedition-theme ${themeClass}">${g.theme}</span>
          <span class="expedition-slots-badge ${slotsClass}">${slotsText}</span>
        </div>
        <h4 class="expedition-title">${g.title}</h4>
        
        <div class="expedition-meta-item">
          <i class="fa-solid fa-plane-departure"></i> Depart Date: <strong>Today (Same-Day)</strong>
        </div>
        <div class="expedition-meta-item">
          <i class="fa-solid fa-wallet"></i> Budget: <strong>${g.budget} Tier</strong>
        </div>
        <div class="expedition-meta-item">
          <i class="fa-solid fa-shield-halved"></i> Min Trust: <strong>${g.trustRequirement}</strong>
        </div>
        <div class="expedition-meta-item" style="font-size: 9px; color:#8b5cf6;">
          <i class="fa-solid fa-user-shield"></i> ${g.guideName}
        </div>
      </div>
      <button class="btn btn-primary btn-xs mt-1" style="width: 100%;" ${g.filledSlots >= g.maxCapacity ? 'disabled' : ''} onclick="joinExpeditionGroup('${g.id}', '${g.title}')">
        ${g.filledSlots >= g.maxCapacity ? 'Sold Out' : 'Join Match Crew'}
      </button>
    `;
    grid.appendChild(card);
  });
};

window.resetExpeditionFilters = function() {
  document.getElementById('exp-filter-dest').value = '';
  document.getElementById('exp-filter-budget').value = '';
  document.getElementById('exp-filter-theme').value = '';
  filterExpeditions();
};

window.joinExpeditionGroup = function(groupId, title) {
  showToast(`Successfully joined group: ${title}!`, 'success');
  
  // Set in-memory active group panel details
  activeGroupId = groupId;
  document.getElementById('active-group-panel').classList.remove('hidden');
  
  const groupTitle = document.getElementById('group-title');
  const groupDates = document.getElementById('group-dates');
  
  if (groupTitle) groupTitle.innerHTML = `<i class="fa-solid fa-users-rectangle"></i> ${title}`;
  if (groupDates) groupDates.innerText = `Today - Next 7 Days (Expedition Board match)`;

  // Scroll to active group panel
  document.getElementById('active-group-panel').scrollIntoView({ behavior: 'smooth' });
};

// Initialize board inside DOMContentLoaded
const originalInitMatchingSimulator = initMatchingSimulator;
initMatchingSimulator = function() {
  originalInitMatchingSimulator();
  activeExpeditionGroups = generate50ExpeditionGroups();
  filterExpeditions();
};

