// Initialize Lucide Icons
lucide.createIcons();

// --- Navbar Scroll Effect ---
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.style.boxShadow = 'var(--shadow-sm)';
    navbar.style.background = 'rgba(255, 255, 255, 0.95)';
  } else {
    navbar.style.boxShadow = 'none';
    navbar.style.background = 'var(--surface)';
  }
});

// --- Mobile Menu Toggle ---
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.querySelector('.nav-links');
const navActions = document.querySelector('.nav-actions');

// Simple mobile menu toggle logic
mobileMenuBtn.addEventListener('click', () => {
  const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
  mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
  
  if (!isExpanded) {
    // We would need a dedicated mobile menu container, but for this simplified version,
    // we can just toggle a class on the navbar or create a basic overlay if needed.
    // For now, we rely on the desktop navigation being hidden on mobile via CSS,
    // and would implement a full mobile overlay if requested.
    alert("Mobile menu clicked! In a full implementation, this opens the mobile drawer.");
  }
});

// --- Scroll Reveal Animations ---
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      observer.unobserve(entry.target);
    }
  });
}, {
  root: null,
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));
