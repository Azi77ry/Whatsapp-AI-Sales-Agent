// Initialize Lucide Icons
lucide.createIcons();

// --- Navbar Scroll Effect ---
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// --- Mobile Menu Toggle ---
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const closeMenuBtn = document.getElementById('closeMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const mobileLinks = document.querySelectorAll('.mobile-link');

function toggleMobileMenu() {
  mobileMenu.classList.toggle('active');
  document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
}

mobileMenuBtn.addEventListener('click', toggleMobileMenu);
closeMenuBtn.addEventListener('click', toggleMobileMenu);
mobileLinks.forEach(link => {
  link.addEventListener('click', toggleMobileMenu);
});

// --- Scroll Reveal Animations ---
const revealElements = document.querySelectorAll('.reveal-up, .reveal-left');

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      observer.unobserve(entry.target);
    }
  });
}, {
  root: null,
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));

// --- Statistics Counters ---
const statsGrid = document.getElementById('statsGrid');
const statValues = document.querySelectorAll('.stat-value');
let statsAnimated = false;

function animateValue(obj, start, end, duration, suffix = '') {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    // easing out
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    let currentVal = Math.floor(easeProgress * (end - start) + start);
    
    // Formatting numbers with commas
    if(currentVal >= 1000) {
        currentVal = currentVal.toLocaleString('en-US');
    }
    
    // For 1M+ case, simplify
    if (end >= 1000000 && progress === 1) {
      obj.innerHTML = '1M' + suffix;
    } else {
      obj.innerHTML = currentVal + suffix;
    }
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

const statsObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !statsAnimated) {
    statsAnimated = true;
    statValues.forEach(stat => {
      const target = parseInt(stat.getAttribute('data-target'));
      const suffix = stat.getAttribute('data-suffix') || '';
      animateValue(stat, 0, target, 2000, suffix);
    });
  }
}, { threshold: 0.5 });

if (statsGrid) {
  statsObserver.observe(statsGrid);
}

// --- FAQ Accordion ---
const faqItems = document.querySelectorAll('.faq-question');

faqItems.forEach(item => {
  item.addEventListener('click', () => {
    const parent = item.parentElement;
    const answer = parent.querySelector('.faq-answer');
    const icon = item.querySelector('.faq-icon');
    
    const isOpen = parent.classList.contains('active');
    
    // Close all other accordions
    document.querySelectorAll('.faq-item').forEach(otherItem => {
      otherItem.classList.remove('active');
      otherItem.querySelector('.faq-answer').style.maxHeight = null;
      otherItem.querySelector('.faq-icon').style.transform = 'rotate(0deg)';
      otherItem.querySelector('.faq-question').style.color = 'white';
    });
    
    // Open clicked accordion if it was closed
    if (!isOpen) {
      parent.classList.add('active');
      answer.style.maxHeight = answer.scrollHeight + "px";
      icon.style.transform = 'rotate(180deg)';
      item.style.color = 'var(--primary)';
    }
  });
});

// --- Chat Simulation Script ---
const chatContainer = document.getElementById('chatSimulation');

const chatSequence = [
  { type: 'in', text: "Habari, nina shida na Jezi ya Simba ipo?", delay: 1000 },
  { type: 'out', text: "Habari! Ndiyo, Jezi ya Simba Original ipo. Tunauza kwa TZS 35,000 tu. 🦁", delay: 2000 },
  { type: 'out', text: "Tuna size M, L, na XL. Ungependa nikuwekee oda yako sasa hivi?", delay: 1000 },
  { type: 'in', text: "Ndio, nahitaji size L. Mna deliver?", delay: 3000 },
  { type: 'out', text: "Sawa kabisa! Tumethibitisha oda yako ya Jezi (Size L). 📦", delay: 2000 },
  { type: 'out', text: "Ndiyo, tunafanya delivery. Tafadhali nitumie anuani yako ili tupange usafiri leo.", delay: 1500 }
];

async function runChatSimulation() {
  if(!chatContainer) return;
  chatContainer.innerHTML = '';
  
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < chatSequence.length; i++) {
    const msg = chatSequence[i];
    await wait(msg.delay);
    
    // Show typing indicator if it's AI (out)
    let typingDiv = null;
    if (msg.type === 'out') {
      typingDiv = document.createElement('div');
      typingDiv.className = 'chat-msg msg-out typing-indicator';
      typingDiv.innerHTML = '<span></span><span></span><span></span>';
      chatContainer.appendChild(typingDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      await wait(1500); // simulate typing time
      typingDiv.remove();
    }
    
    // Append actual message
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg msg-${msg.type}`;
    msgDiv.innerHTML = msg.text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// Start chat simulation when the chat mockup is visible
const chatObserver = new IntersectionObserver((entries) => {
  if(entries[0].isIntersecting) {
    runChatSimulation();
    chatObserver.disconnect();
  }
}, { threshold: 0.5 });

const chatMockup = document.querySelector('.chat-mockup');
if (chatMockup) {
  chatObserver.observe(chatMockup);
}
