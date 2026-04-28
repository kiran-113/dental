// Initialize dashboard data on page load
document.addEventListener('DOMContentLoaded', () => {
    setupNumericContactFields();
    loadTodayFollowups();
});

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

// Handle tab navigation
function openTab(event, tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active state from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Activate the selected tab and matching nav button
    document.getElementById(tabId).classList.add('active');
    const navButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (navButton) navButton.classList.add('active');

    // If opening View Records, fetch the data
    if (tabId === 'view-records') {
        loadPatients();
    } else if (tabId === 'about') {
        loadTodayFollowups();
    }
}

// Handle patient form submission
document.getElementById('patientForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusDiv = document.getElementById('statusMessage');
    statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving patient record...';
    statusDiv.style.backgroundColor = "#eaf4ff";
    statusDiv.style.color = "#0056b3";

    // Construct payload
    const payload = {
        name: document.getElementById('name').value,
        address: document.getElementById('address').value,
        contact_number: document.getElementById('contact-number').value,
        followup_date: document.getElementById('followup').value,
        medications: document.getElementById('medications').value,
        notes: document.getElementById('notes').value
    };

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> Patient successfully registered in system!';
            statusDiv.style.backgroundColor = "#d4edda";
            statusDiv.style.color = "#155724";
            document.getElementById('patientForm').reset();
        } else {
            throw new Error("Failed to register patient");
        }
    } catch (error) {
        console.error("Submission Error:", error);
        statusDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Failed to save. Please verify your Vercel DB connection.';
        statusDiv.style.backgroundColor = "#f8d7da";
        statusDiv.style.color = "#721c24";
    }

    // Auto-clear message after 5 seconds
    setTimeout(() => {
        statusDiv.innerHTML = "";
        statusDiv.style.backgroundColor = "transparent";
    }, 5000);
});

// Fetch and display patients
async function loadPatients() {
    const tbody = document.getElementById('patientsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading records...</td></tr>';

    try {
        const response = await fetch('/api/patients');
        const patients = await response.json();

        tbody.innerHTML = '';
        if (patients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2.5rem;"><i class="fa-regular fa-folder-open fa-3x" style="color: #cbd5e1; margin-bottom: 1rem;"></i><br>No patient records found.</td></tr>';
            return;
        }

        patients.forEach(patient => {
            const followupDate = patient.followup_date ? new Date(patient.followup_date).toLocaleDateString('en-IN') : 'N/A';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Name"><strong class="patient-name-link" onclick='openViewModal(${JSON.stringify(patient).replace(/'/g, "&apos;")})'>${patient.name}</strong></td>
                <td data-label="Contact">${patient.contact_number}</td>
                <td data-label="Follow-up">${followupDate}</td>
                <td data-label="Medications">${patient.medications || '-'}</td>
                <td data-label="Actions">
                    <button class="btn-edit" onclick='openEditModal(${JSON.stringify(patient).replace(/'/g, "&apos;")})'><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error loading patients:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Failed to load records.</td></tr>';
    }
}

// Fetch and display today's follow-ups
async function loadTodayFollowups() {
    const tbody = document.getElementById('todayTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading records...</td></tr>';

    try {
        const response = await fetch('/api/patients/today');
        const patients = await response.json();

        tbody.innerHTML = '';
        if (patients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 2rem;"><i class="fa-regular fa-calendar-check fa-2x" style="color: #cbd5e1; margin-bottom: 0.5rem;"></i><br>No follow-ups scheduled for today.</td></tr>';
            return;
        }

        patients.forEach(patient => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Name"><strong>${patient.name}</strong></td>
                <td data-label="Contact Number">${patient.contact_number}</td>
                <td data-label="Actions">
                    <button class="btn-view" onclick='openViewModal(${JSON.stringify(patient).replace(/'/g, "&apos;")})'><i class="fa-solid fa-clock-rotate-left"></i> History</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error loading today's patients:", error);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Failed to load records.</td></tr>';
    }
}

// View History Modal logic
function openViewModal(patient) {
    const content = document.getElementById('view-details-content');
    const followupDate = patient.followup_date ? new Date(patient.followup_date).toLocaleDateString('en-IN') : 'N/A';
    const createdDate = patient.created_at ? new Date(patient.created_at).toLocaleDateString('en-IN') : 'N/A';

    content.innerHTML = `
        <div class="detail-item"><strong>Name:</strong> <p>${patient.name}</p></div>
        <div class="detail-item"><strong>Contact:</strong> <p>${patient.contact_number}</p></div>
        <div class="detail-item full-width"><strong>Address:</strong> <p>${patient.address}</p></div>
        <div class="detail-item"><strong>Follow-up Date:</strong> <p>${followupDate}</p></div>
        <div class="detail-item"><strong>Registration Date:</strong> <p>${createdDate}</p></div>
        <div class="detail-item full-width"><strong>Current Medications:</strong> <p>${patient.medications || 'None'}</p></div>
        <div class="detail-item full-width"><strong>Doctor's Notes & History:</strong> <p>${patient.notes || 'No notes provided.'}</p></div>
    `;

    document.getElementById('viewModal').style.display = 'block';
}

function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// Modal logic
function openEditModal(patient) {
    document.getElementById('edit-id').value = patient.id;
    document.getElementById('edit-name').value = patient.name;
    document.getElementById('edit-address').value = patient.address;
    document.getElementById('edit-contact').value = patient.contact_number;
    // Format date properly for input type="date" (YYYY-MM-DD)
    document.getElementById('edit-followup').value = patient.followup_date ? new Date(patient.followup_date).toISOString().split('T')[0] : '';
    document.getElementById('edit-medications').value = patient.medications || '';
    document.getElementById('edit-notes').value = patient.notes || '';

    document.getElementById('editModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

// Handle edit form submission
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;

    const payload = {
        name: document.getElementById('edit-name').value,
        address: document.getElementById('edit-address').value,
        contact_number: document.getElementById('edit-contact').value,
        followup_date: document.getElementById('edit-followup').value,
        medications: document.getElementById('edit-medications').value,
        notes: document.getElementById('edit-notes').value
    };

    try {
        await fetch(`/api/patients/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        closeModal();
        loadPatients(); // Refresh the list
    } catch (error) {
        console.error("Error updating patient:", error);
        alert("Failed to update patient record.");
    }
});
