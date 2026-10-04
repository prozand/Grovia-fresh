class GroviaMapElement extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div id="map" style="width: 100%; height: 100vh;"></div>
            <div id="radius-badge" style="position: absolute; bottom: 30px; left: 20px; z-index: 1000; background: white; color: #2c5e3b; border: 2px solid #2c5e3b; padding: 10px 16px; border-radius: 30px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">📍 Connecting to Grovia database...</div>
        `;

        this.loadDependencies(() => {
            this.initMap();
        });
    }

    loadDependencies(callback) {
        let leafletLoaded = window.L !== undefined;
        let supabaseLoaded = window.supabase !== undefined;

        const checkReady = () => {
            if (leafletLoaded && supabaseLoaded) callback();
        };

        if (!leafletLoaded) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => {
                leafletLoaded = true;
                checkReady();
            };
            document.head.appendChild(script);
        }

        if (!supabaseLoaded) {
            const supabaseScript = document.createElement('script');
            supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            supabaseScript.onload = () => {
                supabaseLoaded = true;
                checkReady();
            };
            document.head.appendChild(supabaseScript);
        } else {
            checkReady();
        }
    }

    async initMap() {
        const L = window.L;
        const badge = this.querySelector('#radius-badge');
        
        const map = L.map(this.querySelector('#map'), {
            zoomControl: true,
            tap: true
        }).setView([44.12, -79.8], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        setTimeout(() => { map.invalidateSize(); }, 250);

        const SUPABASE_URL = 'https://xlftvjrhzklunsbaxcur.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_uaolZH8xAaLSPE91nHaIbA_pFKxUEHt';
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        badge.innerHTML = `📍 Loading Grovia stands...`;

        let farms = [];
        try {
            const { data, error } = await supabase.from('farms').select('*').eq('active', true);
            if (error) throw error;
            if (data) farms = data;
        } catch (err) {
            console.error("Error loading farms:", err);
            badge.innerHTML = `⚠️ Could not load stands from database.`;
        }

        farms.forEach(farm => {
            if (!farm.latitude || !farm.longitude) return;

            const customIcon = L.divIcon({
                className: 'custom-farm-marker',
                html: '<div style="background: #ffffff; border: 2px solid #2c5e3b; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer;">🥚</div>',
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                popupAnchor: [0, -20]
            });

            const marker = L.marker([farm.latitude, farm.longitude], { icon: customIcon }).addTo(map);
            
            const streetNum = farm.street_number || '';
            const streetName = farm.street_name || '';
            const postalCode = farm.postal_code || '';
            const town = farm.town || '';
            const province = farm.province || 'ON';

            const fullAddress = `${streetNum} ${streetName}, ${town}, ${province} ${postalCode}`.trim();
            const verifiedBadge = farm.stripe_token ? '<br><small style="color: #2e7d32; font-weight: bold;">✔ Verified Paid Stand</small>' : '';

            // HOVER TOOLTIP: Quick preview on mouseover
            marker.bindTooltip(`<b>${farm.title || 'Grovia Stand'}</b><br><em>Click for details</em>`, {
                direction: 'top',
                offset: [0, -15]
            });

            // CLICK POPUP: Detailed view
            marker.bindPopup(`
                <div style="font-size: 14px; line-height: 1.4; padding: 4px; min-width: 180px;">
                    <strong style="color: #2c5e3b; font-size: 15px;">${farm.title || 'Grovia Stand'}</strong><br>
                    📍 ${fullAddress}<br>
                    <em>🥚 ${farm.products || ''}</em>
                    ${verifiedBadge}
                </div>
            `);
        });

        let userMarker = null;
        let radiusCircle = null;

        function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * (Math.PI / 180);
            const dLon = (lon2 - lon1) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        }

        const updatePositionOnMap = (lat, lng, label) => {
            map.setView([lat, lng], 11);

            if (userMarker) map.removeLayer(userMarker);
            if (radiusCircle) map.removeLayer(radiusCircle);

            userMarker = L.circleMarker([lat, lng], { 
                radius: 10, color: '#1a3c26', fillColor: '#2e7d32', fillOpacity: 0.9, weight: 2 
            }).addTo(map).bindPopup(`<b>Your Location</b><br>${label}`).openPopup();

            radiusCircle = L.circle([lat, lng], { 
                radius: 25000, color: '#d4af37', fillColor: '#d4af37', fillOpacity: 0.1, weight: 1.5 
            }).addTo(map);

            let nearbyCount = 0;
            farms.forEach(farm => {
                const dist = getDistanceFromLatLonInKm(lat, lng, farm.latitude, farm.longitude);
                if (dist <= 25) nearbyCount++;
            });

            badge.innerHTML = `📍 ${nearbyCount} Grovia stands within 25km`;
        };

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    updatePositionOnMap(position.coords.latitude, position.coords.longitude, "Live GPS Position");
                },
                error => {
                    console.warn("GPS permission denied:", error.message);
                    badge.innerHTML = `⚠️ Location access required for local search.`;
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        }

        const locateButton = L.control({position: 'topright'});
        locateButton.onAdd = function () {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            div.innerHTML = '<a href="#" title="Find My Location" style="font-size: 18px; width: 36px; height: 36px; line-height: 36px; text-align: center; background: white; display: block; text-decoration: none; color: #2c5e3b; font-weight: bold;">📍</a>';
            div.onclick = function(e) {
                e.preventDefault();
                if ("geolocation" in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        position => updatePositionOnMap(position.coords.latitude, position.coords.longitude, "Manual GPS Fix"),
                        error => alert("Location access denied. Please allow it in your browser."),
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    );
                }
            };
            return div;
        };
        locateButton.addTo(map);
    }
}

customElements.define('map-element', GroviaMapElement);
