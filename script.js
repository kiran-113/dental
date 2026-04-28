// Initialize dashboard data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadTodayFollowups();
});

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

    // Activate the selected tab and button
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');

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
    statusDiv.textContent = "Saving patient record...";
    statusDiv.style.backgroundColor = "#eaf4ff";
    statusDiv.style.color = "#0056b3";

    // Construct payload
    const payload = {
        name: document.getElementById('name').value,
        address: document.getElementById('address').value,
        contact_number: document.getElementById('contact').value,
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
            statusDiv.textContent = "✅ Patient successfully registered in system!";
            statusDiv.style.backgroundColor = "#d4edda";
            statusDiv.style.color = "#155724";
            document.getElementById('patientForm').reset();
        } else {
            throw new Error("Failed to register patient");
        }
    } catch (error) {
        console.error("Submission Error:", error);
        statusDiv.textContent = "❌ Failed to save. Please verify your Vercel DB connection.";
        statusDiv.style.backgroundColor = "#f8d7da";
        statusDiv.style.color = "#721c24";
    }

    // Auto-clear message after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = "";
        statusDiv.style.backgroundColor = "transparent";
    }, 5000);
});

// Fetch and display patients
async function loadPatients() {
    const tbody = document.getElementById('patientsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading records...</td></tr>';

    try {
        const response = await fetch('/api/patients');
        const patients = await response.json();

        tbody.innerHTML = '';
        if (patients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No patient records found.</td></tr>';
            return;
        }

        patients.forEach(patient => {
            const followupDate = patient.followup_date ? new Date(patient.followup_date).toLocaleDateString('en-IN') : 'N/A';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong class="patient-name-link" onclick='openViewModal(${JSON.stringify(patient).replace(/'/g, "&apos;")})'>${patient.name}</strong></td>
                <td>${patient.contact_number}</td>
                <td>${followupDate}</td>
                <td>${patient.medications || '-'}</td>
                <td>
                    <button class="btn-edit" onclick='openEditModal(${JSON.stringify(patient).replace(/'/g, "&apos;")})'>Edit</button>
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
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading records...</td></tr>';

    try {
        const response = await fetch('/api/patients/today');
        const patients = await response.json();

        tbody.innerHTML = '';
        if (patients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No follow-ups scheduled for today.</td></tr>';
            return;
        }

        patients.forEach(patient => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${patient.name}</strong></td>
                <td>${patient.contact_number}</td>
                <td>
                    <button class="btn-view" onclick='openViewModal(${JSON.stringify(patient).replace(/'/g, "&apos;")})'>View History</button>
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