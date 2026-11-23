
document.addEventListener("DOMContentLoaded", async () => {
    if (location.pathname.endsWith("/settings.html")) return;

    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    const profile = document.createElement("div");
    profile.className = "shared-profile";
    profile.innerHTML = `
        <button class="shared-profile-button" type="button"
                aria-label="User menu" aria-expanded="false">
            <span class="shared-profile-avatar">U</span>
            <span class="shared-profile-name">User</span>
            <span class="shared-profile-arrow">▼</span>
        </button>

        <div class="shared-profile-menu" hidden>
            <a href="artist-profile.html">My Profile</a>
            <a href="settings.html">Settings</a>
            <button type="button" class="shared-profile-logout">
                Log Out
            </button>
        </div>
    `;

    topbar.appendChild(profile);

    const button = profile.querySelector(".shared-profile-button");
    const menu = profile.querySelector(".shared-profile-menu");

    button.addEventListener("click", () => {
        menu.hidden = !menu.hidden;
        button.setAttribute("aria-expanded", String(!menu.hidden));
    });

    document.addEventListener("click", event => {
        if (!profile.contains(event.target)) {
            menu.hidden = true;
            button.setAttribute("aria-expanded", "false");
        }
    });

    profile.querySelector(".shared-profile-logout")
        .addEventListener("click", () => {
            localStorage.removeItem("conchordiaToken");
            window.location.href = "login.html";
        });

    const token = localStorage.getItem("conchordiaToken");
    if (!token) return;

    try {
        const response = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        const user = data.user || data;

        const name =
            user.firstName ||
            user.first_name ||
            user.displayName ||
            user.display_name ||
            user.fullName ||
            user.full_name ||
            user.name ||
            user.username ||
            user.email?.split("@")[0] ||
            "User";

        profile.querySelector(".shared-profile-name").textContent = name;

        profile.querySelector(".shared-profile-avatar").textContent =
            name.trim().charAt(0).toUpperCase();
    } catch (error) {
        console.error("Unable to load profile:", error);
    }
});
