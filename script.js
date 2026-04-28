const state = {
    patients: [],
    activePatient: null,
    activeVisits: [],
    treatmentCategories: []
};

document.addEventListener('DOMContentLoaded', () => {
    setupNumericContactFields();
    setupRecordControls();
    setupVisitForm();
    setupLoginForm();
    setTodayDateLabel();
    checkAuth();
});

function setupLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('loginMessage');
        message.textContent = 'Signing in...';
        message.className = '';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('login-username').value,
                    password: document.getElementById('login-password').value
                })
            });

            if (!response.ok) throw new Error('Invalid login');

            document.getElementById('loginOverlay').classList.add('hidden');
            form.reset();
            await loadTreatmentCategories();
            await loadDashboard();
        } catch (error) {
            console.error('Login error:', error);
            message.textContent = 'Invalid username or password.';
            message.className = 'error-text';
        }
    });
}

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) throw new Error('Not signed in');

        document.getElementById('loginOverlay').classList.add('hidden');
        await loadTreatmentCategories();
        await loadDashboard();
    } catch {
        document.getElementById('loginOverlay').classList.remove('hidden');
    }
}

async function logoutDoctor() {
    await fetch('/api/auth/logout', { method: 'POST' });
    state.patients = [];
    state.activePatient = null;
    state.activeVisits = [];
    state.treatmentCategories = [];
    document.getElementById('loginOverlay').classList.remove('hidden');
}

function setupNumericContactFields() {
    ['contact-number', 'edit-contact'].forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) return;

        field.addEventListener('beforeinput', (event) => {
            if (event.data && /\D/.test(event.data)) {
                event.preventDefault();
            }
        });

        field.addEventListener('input', () => {
            field.value = field.value.replace(/\D/g, '');
        });
    });
}

function setupRecordControls() {
    ['recordSearch', 'statusFilter', 'dateFilter', 'sortRecords'].forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.addEventListener('input', renderPatients);
        field.addEventListener('change', renderPatients);
    });
}

function setupVisitForm() {
    const form = document.getElementById('visitForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const patientId = document.getElementById('visit-patient-id').value;
        if (!patientId) return;

        const payload = {
            visit_date: document.getElementById('visit-date').value,
            diagnosis: document.getElementById('visit-diagnosis').value,
            treatment: document.getElementById('visit-treatment').value,
            medications: document.getElementById('visit-medications').value,
            notes: document.getElementById('visit-notes').value,
            next_followup_date: document.getElementById('visit-next-followup').value || null,
            treatment_category: document.getElementById('visit-treatment-category').value || null
        };

        try {
            const response = await fetch(`/api/patients/${patientId}/visits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to add visit');

            form.reset();
            setTodayOnVisitForm();
            await loadVisits(patientId);
            await loadPatients();
            await loadDashboard();
            await loadActivityLogs();
        } catch (error) {
            console.error('Error adding visit:', error);
            alert('Failed to add visit history.');
        }
    });
}

function openTab(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabId).classList.add('active');
    const navButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (navButton) navButton.classList.add('active');

    if (tabId === 'view-records') {
        loadRecordsPage();
    } else if (tabId === 'about') {
        loadDashboard();
    }
}

async function loadRecordsPage() {
    await Promise.all([loadPatients(), loadActivityLogs(), loadAutomaticReminderStatus()]);
}

async function loadDashboard() {
    await Promise.all([loadDashboardStats(), loadTodayFollowups()]);
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        if (response.status === 401) return handleUnauthorized();
        const stats = await response.json();

        document.getElementById('statTodayFollowups').textContent = stats.today_followups || 0;
        document.getElementById('statUpcomingFollowups').textContent = stats.upcoming_followups || 0;
        document.getElementById('statMissedFollowups').textContent = stats.missed_followups || 0;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

document.getElementById('patientForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const statusDiv = document.getElementById('statusMessage');
    statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving patient record...';
    statusDiv.style.backgroundColor = '#eaf4ff';
    statusDiv.style.color = '#0056b3';

    const payload = {
        name: document.getElementById('name').value,
        address: document.getElementById('address').value,
        contact_number: document.getElementById('contact-number').value,
        followup_date: document.getElementById('followup').value,
        medications: document.getElementById('medications').value,
        notes: document.getElementById('notes').value,
        status: 'Pending',
        whatsapp_consent: document.getElementById('whatsapp-consent').checked,
        treatment_category: document.getElementById('treatment-category').value || null
    };

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Failed to register patient');

        statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> Patient successfully registered in system!';
        statusDiv.style.backgroundColor = '#d4edda';
        statusDiv.style.color = '#155724';
        document.getElementById('patientForm').reset();
        await loadDashboard();
    } catch (error) {
        console.error('Submission Error:', error);
        statusDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Failed to save. Please verify your Vercel DB connection.';
        statusDiv.style.backgroundColor = '#f8d7da';
        statusDiv.style.color = '#721c24';
    }

    setTimeout(() => {
        statusDiv.innerHTML = '';
        statusDiv.style.backgroundColor = 'transparent';
    }, 5000);
});

async function loadPatients() {
    const tbody = document.getElementById('patientsTableBody');
    tbody.innerHTML = loadingRow(6, 'Loading records...');

    try {
        const response = await fetch('/api/patients');
        if (response.status === 401) return handleUnauthorized();
        state.patients = await response.json();
        updateRecordsTotal();
        renderPatients();
    } catch (error) {
        console.error('Error loading patients:', error);
        tbody.innerHTML = errorRow(6, 'Failed to load records.');
    }
}

function updateRecordsTotal() {
    const totalElement = document.getElementById('recordsTotalPatients');
    if (totalElement) totalElement.textContent = state.patients.length;
}

function setTodayDateLabel() {
    const label = document.getElementById('todayDateLabel');
    if (!label) return;

    label.textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function renderPatients() {
    const tbody = document.getElementById('patientsTableBody');
    const patients = getFilteredPatients();

    tbody.innerHTML = '';
    if (patients.length === 0) {
        tbody.innerHTML = emptyRow(6, 'No patient records match your filters.');
        return;
    }

    patients.forEach(patient => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Name"><strong class="patient-name-link" onclick='openViewModal(${patient.id})'>${escapeHtml(patient.name)}</strong></td>
            <td data-label="Contact">${escapeHtml(patient.contact_number)}</td>
            <td data-label="Follow-up">${formatDate(patient.followup_date)}</td>
            <td data-label="Category">${escapeHtml(patient.treatment_category || '-')}</td>
            <td data-label="Medications">${escapeHtml(patient.medications || '-')}</td>
            <td data-label="Actions" class="action-cell">
                ${statusSelect(patient)}
                ${reminderButton(patient)}
                <button class="btn-view" onclick='openViewModal(${patient.id})'><i class="fa-solid fa-clock-rotate-left"></i> History</button>
                <button class="btn-edit" onclick='openEditModal(${patient.id})'><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                <button class="btn-archive" onclick='archivePatient(${patient.id})'><i class="fa-solid fa-box-archive"></i> Archive</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getFilteredPatients() {
    const query = (document.getElementById('recordSearch')?.value || '').toLowerCase().trim();
    const status = document.getElementById('statusFilter')?.value || 'all';
    const dateFilter = document.getElementById('dateFilter')?.value || 'all';
    const sortBy = document.getElementById('sortRecords')?.value || 'newest';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...state.patients]
        .filter(patient => {
            const matchesQuery = !query ||
                String(patient.name || '').toLowerCase().includes(query) ||
                String(patient.contact_number || '').includes(query);
            const matchesStatus = status === 'all' || patient.status === status;
            const followupDate = patient.followup_date ? new Date(patient.followup_date) : null;
            if (followupDate) followupDate.setHours(0, 0, 0, 0);

            let matchesDate = true;
            if (dateFilter === 'today') matchesDate = followupDate && followupDate.getTime() === today.getTime();
            if (dateFilter === 'upcoming') matchesDate = followupDate && followupDate > today;
            if (dateFilter === 'missed') matchesDate = followupDate && followupDate < today && patient.status !== 'Completed';

            return matchesQuery && matchesStatus && matchesDate;
        })
        .sort((a, b) => sortPatients(a, b, sortBy));
}

function sortPatients(a, b, sortBy) {
    if (sortBy === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    if (sortBy === 'followup-asc') return new Date(a.followup_date || '9999-12-31') - new Date(b.followup_date || '9999-12-31');
    if (sortBy === 'name-asc') return String(a.name || '').localeCompare(String(b.name || ''));
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

async function loadTodayFollowups() {
    const tbody = document.getElementById('todayTableBody');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(3, 'Loading records...');

    try {
        const response = await fetch('/api/patients/today');
        if (response.status === 401) return handleUnauthorized();
        const patients = await response.json();

        tbody.innerHTML = '';
        if (patients.length === 0) {
            tbody.innerHTML = emptyRow(3, 'No follow-ups scheduled for today.');
            return;
        }

        patients.forEach(patient => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Name"><strong class="patient-name-link" onclick='openViewModal(${patient.id})'>${escapeHtml(patient.name)}</strong></td>
                <td data-label="Contact Number">${escapeHtml(patient.contact_number)}</td>
                <td data-label="Actions" class="action-cell">
                    ${statusSelect(patient)}
                    ${reminderButton(patient)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error loading today's patients:", error);
        tbody.innerHTML = errorRow(3, 'Failed to load records.');
    }
}

async function openViewModal(patientId) {
    const patient = state.patients.find(item => item.id === patientId) || await fetchPatientById(patientId);
    if (!patient) return;

    state.activePatient = patient;
    document.getElementById('visit-patient-id').value = patient.id;
    setTodayOnVisitForm();

    const content = document.getElementById('view-details-content');
    content.innerHTML = `
        <div class="detail-item"><strong>Name:</strong> <p>${escapeHtml(patient.name)}</p></div>
        <div class="detail-item"><strong>Contact:</strong> <p>${escapeHtml(patient.contact_number)}</p></div>
        <div class="detail-item"><strong>Follow-up Date:</strong> <p>${formatDate(patient.followup_date)}</p></div>
        <div class="detail-item"><strong>Status:</strong> <p>${statusBadge(patient.status)}</p></div>
        <div class="detail-item"><strong>Registration Date:</strong> <p>${formatDate(patient.created_at)}</p></div>
        <div class="detail-item"><strong>Treatment Category:</strong> <p>${escapeHtml(patient.treatment_category || 'Not selected')}</p></div>
        <div class="detail-item"><strong>WhatsApp Consent:</strong> <p>${patient.whatsapp_consent ? 'Yes' : 'No'}</p></div>
        <div class="detail-item"><strong>Last Reminder:</strong> <p>${formatDateTime(patient.last_reminder_sent_at)}</p></div>
        <div class="detail-item full-width"><strong>Address:</strong> <p>${escapeHtml(patient.address)}</p></div>
        <div class="detail-item full-width"><strong>Current Medications:</strong> <p>${escapeHtml(patient.medications || 'None')}</p></div>
        <div class="detail-item full-width"><strong>Doctor's Notes:</strong> <p>${escapeHtml(patient.notes || 'No notes provided.')}</p></div>
    `;

    document.getElementById('viewModal').style.display = 'block';
    await loadVisits(patient.id);
}

async function fetchPatientById(patientId) {
    if (!state.patients.length) await loadPatients();
    return state.patients.find(item => item.id === patientId);
}

async function loadVisits(patientId) {
    const timeline = document.getElementById('visitTimeline');
    timeline.innerHTML = '<div class="timeline-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading visit history...</div>';

    try {
        const response = await fetch(`/api/patients/${patientId}/visits`);
        if (response.status === 401) return handleUnauthorized();
        const visits = await response.json();
        state.activeVisits = visits;

        if (visits.length === 0) {
            timeline.innerHTML = '<div class="timeline-empty">No visit entries yet.</div>';
            return;
        }

        timeline.innerHTML = visits.map(visit => `
            <article class="timeline-item">
                <time>${formatDate(visit.visit_date)}</time>
                <h3>${escapeHtml(visit.diagnosis || 'General Visit')}</h3>
                <p><strong>Category:</strong> ${escapeHtml(visit.treatment_category || '-')}</p>
                <p><strong>Treatment:</strong> ${escapeHtml(visit.treatment || '-')}</p>
                <p><strong>Medications:</strong> ${escapeHtml(visit.medications || '-')}</p>
                <p><strong>Notes:</strong> ${escapeHtml(visit.notes || '-')}</p>
                ${visit.next_followup_date ? `<p><strong>Next Follow-up:</strong> ${formatDate(visit.next_followup_date)}</p>` : ''}
            </article>
        `).join('');
    } catch (error) {
        console.error('Error loading visits:', error);
        state.activeVisits = [];
        timeline.innerHTML = '<div class="timeline-empty error-text">Failed to load visit history.</div>';
    }
}

function handleUnauthorized() {
    document.getElementById('loginOverlay').classList.remove('hidden');
}

function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
}

function printPatientSummary() {
    if (!state.activePatient) return;

    const patient = state.activePatient;
    const visitsMarkup = state.activeVisits.length
        ? state.activeVisits.map(visit => `
            <section class="visit">
                <h3>${escapeHtml(visit.diagnosis || 'General Visit')}</h3>
                <p><strong>Visit Date:</strong> ${formatDate(visit.visit_date)}</p>
                <p><strong>Category:</strong> ${escapeHtml(visit.treatment_category || '-')}</p>
                <p><strong>Treatment:</strong> ${escapeHtml(visit.treatment || '-')}</p>
                <p><strong>Medications:</strong> ${escapeHtml(visit.medications || '-')}</p>
                <p><strong>Notes:</strong> ${escapeHtml(visit.notes || '-')}</p>
                ${visit.next_followup_date ? `<p><strong>Next Follow-up:</strong> ${formatDate(visit.next_followup_date)}</p>` : ''}
            </section>
        `).join('')
        : '<p>No visit entries recorded.</p>';

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        alert('Please allow pop-ups to print the patient summary.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Patient Summary - ${escapeHtml(patient.name)}</title>
            <style>
                body { color: #20313f; font-family: Arial, sans-serif; margin: 32px; line-height: 1.45; }
                header { border-bottom: 2px solid #047c8a; margin-bottom: 20px; padding-bottom: 14px; }
                h1 { color: #075569; margin: 0 0 4px; }
                h2 { color: #075569; border-bottom: 1px solid #dce7ed; padding-bottom: 6px; }
                h3 { margin: 0 0 8px; color: #047c8a; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-bottom: 22px; }
                .item { border: 1px solid #dce7ed; border-radius: 6px; padding: 10px; }
                .full { grid-column: 1 / -1; }
                .visit { border-left: 4px solid #047c8a; margin-bottom: 14px; padding: 10px 12px; background: #f8fbfc; }
                p { margin: 4px 0; }
                @media print { body { margin: 18mm; } button { display: none; } }
            </style>
        </head>
        <body>
            <header>
                <h1>SmileCare India</h1>
                <p>Patient Summary | Printed on ${new Date().toLocaleDateString('en-IN')}</p>
            </header>
            <h2>Patient Details</h2>
            <section class="grid">
                <div class="item"><strong>Name</strong><p>${escapeHtml(patient.name)}</p></div>
                <div class="item"><strong>Contact</strong><p>${escapeHtml(patient.contact_number)}</p></div>
                <div class="item"><strong>Follow-up Date</strong><p>${formatDate(patient.followup_date)}</p></div>
                <div class="item"><strong>Status</strong><p>${escapeHtml(patient.status || 'Pending')}</p></div>
                <div class="item"><strong>Treatment Category</strong><p>${escapeHtml(patient.treatment_category || 'Not selected')}</p></div>
                <div class="item full"><strong>Address</strong><p>${escapeHtml(patient.address)}</p></div>
                <div class="item full"><strong>Current Medications</strong><p>${escapeHtml(patient.medications || 'None')}</p></div>
                <div class="item full"><strong>Doctor Notes</strong><p>${escapeHtml(patient.notes || 'No notes provided.')}</p></div>
            </section>
            <h2>Visit Timeline</h2>
            ${visitsMarkup}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function openEditModal(patientId) {
    const patient = state.patients.find(item => item.id === patientId);
    if (!patient) return;

    document.getElementById('edit-id').value = patient.id;
    document.getElementById('edit-name').value = patient.name;
    document.getElementById('edit-address').value = patient.address;
    document.getElementById('edit-contact').value = patient.contact_number;
    document.getElementById('edit-followup').value = patient.followup_date ? toDateInputValue(patient.followup_date) : '';
    document.getElementById('edit-medications').value = patient.medications || '';
    document.getElementById('edit-notes').value = patient.notes || '';
    document.getElementById('edit-whatsapp-consent').checked = Boolean(patient.whatsapp_consent);
    document.getElementById('edit-treatment-category').value = patient.treatment_category || '';

    document.getElementById('editModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

document.getElementById('editForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('edit-id').value;

    const payload = {
        name: document.getElementById('edit-name').value,
        address: document.getElementById('edit-address').value,
        contact_number: document.getElementById('edit-contact').value,
        followup_date: document.getElementById('edit-followup').value,
        medications: document.getElementById('edit-medications').value,
        status: state.patients.find(patient => String(patient.id) === String(id))?.status || 'Pending',
        notes: document.getElementById('edit-notes').value,
        whatsapp_consent: document.getElementById('edit-whatsapp-consent').checked,
        treatment_category: document.getElementById('edit-treatment-category').value || null
    };

    try {
        const response = await fetch(`/api/patients/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to update patient');

        closeModal();
        await loadPatients();
        await loadDashboard();
        await loadActivityLogs();
    } catch (error) {
        console.error('Error updating patient:', error);
        alert('Failed to update patient record.');
    }
});

async function archivePatient(patientId) {
    const patient = state.patients.find(item => item.id === patientId);
    if (!patient) return;
    if (!confirm(`Archive ${patient.name}'s record?`)) return;

    try {
        const response = await fetch(`/api/patients/${patientId}/archive`, { method: 'PATCH' });
        if (!response.ok) throw new Error('Failed to archive patient');

        await loadPatients();
        await loadDashboard();
        await loadActivityLogs();
    } catch (error) {
        console.error('Error archiving patient:', error);
        alert('Failed to archive patient record.');
    }
}

async function updatePatientStatus(patientId, status) {
    const patient = state.patients.find(item => item.id === patientId);
    const previousStatus = patient?.status || 'Pending';

    if (patient) {
        patient.status = status;
        renderPatients();
    }

    try {
        const response = await fetch(`/api/patients/${patientId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error('Failed to update patient status');

        await loadDashboard();
        await loadActivityLogs();
    } catch (error) {
        console.error('Error updating patient status:', error);
        if (patient) {
            patient.status = previousStatus;
            renderPatients();
        }
        alert('Failed to update follow-up status.');
    }
}

async function sendWhatsappReminder(patientId, button) {
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending';

    try {
        const response = await fetch(`/api/patients/${patientId}/reminder/whatsapp`, { method: 'POST' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to send reminder');

        button.innerHTML = '<i class="fa-solid fa-circle-check"></i> Sent';
        await loadPatients();
        await loadDashboard();
        await loadActivityLogs();
    } catch (error) {
        console.error('Reminder error:', error);
        button.innerHTML = originalContent;
        alert(error.message || 'Failed to send WhatsApp reminder.');
    } finally {
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = originalContent;
        }, 1600);
    }
}

function setTodayOnVisitForm() {
    const visitDate = document.getElementById('visit-date');
    if (visitDate && !visitDate.value) {
        visitDate.value = toDateInputValue(new Date());
    }
}

function statusBadge(status = 'Pending') {
    const normalized = String(status || 'Pending');
    return `<span class="status-badge status-${normalized.toLowerCase()}">${escapeHtml(normalized)}</span>`;
}

function statusSelect(patient) {
    const statuses = ['Pending', 'Completed', 'Rescheduled', 'Missed'];
    const currentStatus = patient.status || 'Pending';
    const options = statuses
        .map(status => `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${status}</option>`)
        .join('');

    return `
        <label class="status-control">
            <span>Status</span>
            <select onchange="updatePatientStatus(${patient.id}, this.value)">
                ${options}
            </select>
        </label>
    `;
}

function reminderButton(patient) {
    const disabled = patient.whatsapp_consent ? '' : 'disabled title="WhatsApp consent required"';
    const lastSent = patient.last_reminder_sent_at ? `Last sent: ${formatDateTime(patient.last_reminder_sent_at)}` : 'Send WhatsApp reminder';

    return `
        <button class="btn-reminder" ${disabled} onclick="sendWhatsappReminder(${patient.id}, this)" title="${escapeHtml(lastSent)}">
            <i class="fa-brands fa-whatsapp"></i> Reminder
        </button>
    `;
}

async function loadTreatmentCategories() {
    try {
        const response = await fetch('/api/treatment-categories');
        if (response.status === 401) return handleUnauthorized();
        state.treatmentCategories = await response.json();
        renderTreatmentCategoryOptions();
    } catch (error) {
        console.error('Error loading treatment categories:', error);
    }
}

function renderTreatmentCategoryOptions() {
    ['treatment-category', 'edit-treatment-category', 'visit-treatment-category'].forEach((selectId) => {
        const select = document.getElementById(selectId);
        if (!select) return;

        const selectedValue = select.value;
        select.innerHTML = '<option value="">Select category</option>' + state.treatmentCategories
            .map(category => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`)
            .join('');
        select.value = selectedValue;
    });
}

async function addTreatmentCategory(inputId, targetSelectId) {
    const input = document.getElementById(inputId);
    const name = input.value.trim();
    if (!name) return;

    try {
        const response = await fetch('/api/treatment-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!response.ok) throw new Error('Failed to add treatment category');

        input.value = '';
        await loadTreatmentCategories();
        const targetSelect = document.getElementById(targetSelectId);
        if (targetSelect) targetSelect.value = name;
        await loadActivityLogs();
    } catch (error) {
        console.error('Category error:', error);
        alert('Failed to add treatment category.');
    }
}

async function loadActivityLogs() {
    const list = document.getElementById('activityLogList');
    if (!list) return;

    list.innerHTML = '<div class="timeline-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading activity...</div>';

    try {
        const response = await fetch('/api/activity-logs');
        if (response.status === 401) return handleUnauthorized();
        const logs = await response.json();

        if (logs.length === 0) {
            list.innerHTML = '<div class="timeline-empty">No activity yet.</div>';
            return;
        }

        list.innerHTML = logs.slice(0, 8).map(log => `
            <article class="activity-item">
                <strong>${escapeHtml(log.action)}</strong>
                <span>${escapeHtml(log.patient_name || 'System')} | ${formatDateTime(log.created_at)}</span>
                <p>${escapeHtml(log.details || '')}</p>
            </article>
        `).join('');
    } catch (error) {
        console.error('Activity log error:', error);
        list.innerHTML = '<div class="timeline-empty error-text">Failed to load activity logs.</div>';
    }
}

async function loadAutomaticReminderStatus() {
    const status = document.getElementById('autoReminderStatus');
    if (!status) return;

    try {
        const response = await fetch('/api/reminders/automatic/status');
        if (response.status === 401) return handleUnauthorized();
        const result = await response.json();
        status.textContent = result.lastRunDate ? `Last auto run: ${result.lastRunDate}` : 'Scheduler ready';
    } catch {
        status.textContent = 'Scheduler unavailable';
    }
}

async function runAutomaticReminders() {
    const status = document.getElementById('autoReminderStatus');
    if (status) status.textContent = 'Running reminders...';

    try {
        const response = await fetch('/api/reminders/automatic/run', { method: 'POST' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to run reminders');

        if (status) status.textContent = `Sent ${result.sent}, failed ${result.failed}`;
        await loadPatients();
        await loadDashboard();
        await loadActivityLogs();
    } catch (error) {
        console.error('Automatic reminder error:', error);
        if (status) status.textContent = 'Reminder run failed';
        alert(error.message || 'Failed to run automatic reminders.');
    }
}

function loadingRow(colspan, text) {
    return `<tr><td colspan="${colspan}" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> ${text}</td></tr>`;
}

function emptyRow(colspan, text) {
    return `<tr><td colspan="${colspan}" style="text-align: center; padding: 2rem;"><i class="fa-regular fa-folder-open fa-2x" style="color: #cbd5e1; margin-bottom: 0.5rem;"></i><br>${text}</td></tr>`;
}

function errorRow(colspan, text) {
    return `<tr><td colspan="${colspan}" style="text-align: center; color: #b42318;">${text}</td></tr>`;
}

function formatDate(value) {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN');
}

function formatDateTime(value) {
    if (!value) return 'N/A';
    return new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function toDateInputValue(value) {
    const date = new Date(value);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().split('T')[0];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
