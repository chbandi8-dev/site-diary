import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedStages } from "./seed-stages";
import { seedTemplates } from "./seed-templates";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  await seedStages(prisma);
  await seedTemplates(prisma);

  // Admin user
  // Never a published default. The admin login has no rate limiting and no
  // lockout, so a known password in a public repository is the staff side
  // already owned.
  const adminPassword =
    process.env.ADMIN_PASSWORD ??
    (() => {
      throw new Error(
        "Set ADMIN_PASSWORD before seeding. Generate one with: openssl rand -base64 24"
      );
    })();
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: "admin@site.com" },
    update: {},
    create: {
      email: "admin@site.com",
      password: hashedPassword,
      name: "Admin",
      role: "admin",
    },
  });
  console.log("✓ Admin user created");

  // Site content
  const contentItems = [
    { key: "hero_title", value: "Building Your Vision,\nDelivering Excellence", type: "text", label: "Hero Title" },
    { key: "hero_subtitle", value: "Premium residential and commercial construction across Greater Sydney. From concept to completion, we build with precision and pride.", type: "text", label: "Hero Subtitle" },
    { key: "hero_cta_primary", value: "View Our Projects", type: "text", label: "Hero Primary Button" },
    { key: "hero_cta_secondary", value: "Get a Quote", type: "text", label: "Hero Secondary Button" },
    { key: "hero_image", value: "/images/hero-bg.jpg", type: "image", label: "Hero Background Image" },
    { key: "about_title", value: "We Build Dreams,\nNot Just Structures", type: "text", label: "About Title" },
    { key: "about_subtitle", value: "A Decade of Trusted Craftsmanship", type: "text", label: "About Subtitle" },
    { key: "about_description", value: "For over a decade, Build Demo has been transforming visions into reality across Greater Sydney. We specialize in bespoke residential and commercial projects — from stunning granny flats to large-scale knockdown rebuilds — delivering exceptional quality at every stage.\n\nOur commitment to transparency, craftsmanship, and sustainable building practices has made us the trusted choice for families and investors alike.", type: "richtext", label: "About Description" },
    { key: "about_image", value: "/images/about-image.jpg", type: "image", label: "About Image" },
    { key: "stat_years", value: "10+", type: "text", label: "Years of Experience" },
    { key: "stat_projects", value: "250+", type: "text", label: "Projects Completed" },
    { key: "stat_clients", value: "200+", type: "text", label: "Happy Clients" },
    { key: "stat_team", value: "50+", type: "text", label: "Team Members" },
    { key: "cta_title", value: "Ready to Start Building?", type: "text", label: "CTA Title" },
    { key: "cta_subtitle", value: "Let's turn your vision into reality. Get a free consultation today.", type: "text", label: "CTA Subtitle" },
    { key: "contact_email", value: "info@builddemo.com.au", type: "text", label: "Contact Email" },
    { key: "contact_phone", value: "+61 400 000 000", type: "text", label: "Contact Phone" },
    { key: "contact_address", value: "Sydney, New South Wales, Australia", type: "text", label: "Contact Address" },
    { key: "company_name", value: "Build Demo", type: "text", label: "Company Name" },
    { key: "company_tagline", value: "Building Your Vision", type: "text", label: "Company Tagline" },
    { key: "company_abn", value: "ABN: XX XXX XXX XXX", type: "text", label: "Company ABN" },
  ];

  for (const item of contentItems) {
    await prisma.siteContent.upsert({
      where: { key: item.key },
      update: { value: item.value },
      create: item,
    });
  }
  console.log("✓ Site content seeded");

  // Services
  const services = [
    {
      title: "New Home Builds",
      slug: "new-home-builds",
      description: "From the foundation to the final coat of paint, we manage every aspect of your new home build. Our experienced team brings your architectural vision to life with precision craftsmanship and premium materials.",
      icon: "home",
      features: JSON.stringify(["Custom floor plans", "Premium materials", "Energy-efficient design", "Full project management", "Fixed-price contracts"]),
      order: 1,
    },
    {
      title: "Duplex Construction",
      slug: "duplex-construction",
      description: "Maximize the potential of your land with a beautifully designed duplex. We handle all aspects from design and DA approval to construction and handover, ensuring a seamless experience.",
      icon: "building",
      features: JSON.stringify(["Dual occupancy planning", "DA approval assistance", "Strata subdivision", "Investment-grade finishes", "Rental yield optimization"]),
      order: 2,
    },
    {
      title: "Knockdown Rebuild",
      slug: "knockdown-rebuild",
      description: "Love your suburb but ready for a new home? Our knockdown rebuild service lets you keep your location while completely transforming your property with a stunning new home.",
      icon: "hammer",
      features: JSON.stringify(["Full demolition service", "New home design", "Council approval management", "Temporary accommodation advice", "Turnkey delivery"]),
      order: 3,
    },
    {
      title: "Granny Flats",
      slug: "granny-flats",
      description: "Add value and versatility to your property with a professionally built granny flat. Whether for extended family or rental income, we deliver quality secondary dwellings on time and on budget.",
      icon: "layout",
      features: JSON.stringify(["Complying development", "Custom layouts", "High-quality finishes", "Quick build times", "Rental income potential"]),
      order: 4,
    },
    {
      title: "Home Renovations",
      slug: "home-renovations",
      description: "Transform your existing home with our expert renovation services. From kitchen and bathroom upgrades to complete internal makeovers, we breathe new life into every space we touch.",
      icon: "paintbrush",
      features: JSON.stringify(["Kitchen remodels", "Bathroom renovations", "Room additions", "Open-plan conversions", "Structural modifications"]),
      order: 5,
    },
    {
      title: "Multi-Dwelling",
      slug: "multi-dwelling",
      description: "Unlock the full development potential of your site with our multi-dwelling construction services. From townhouses to residential flat buildings, we deliver exceptional results for developers and investors.",
      icon: "buildings",
      features: JSON.stringify(["Townhouse development", "Unit complexes", "SEPP compliance", "Full DA management", "Investment ROI focus"]),
      order: 6,
    },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: {},
      create: service,
    });
  }
  console.log("✓ Services seeded");

  // Projects
  const projects = [
    {
      title: "Luxury Harbourside Residence",
      slug: "luxury-harbourside-residence",
      shortDescription: "A stunning 5-bedroom waterfront home featuring open-plan living, floor-to-ceiling glass, and a resort-style pool.",
      description: "<h2>Project Overview</h2><p>This breathtaking harbourside residence represents the pinnacle of contemporary Australian living. Working closely with our clients and their architect, we delivered a home that seamlessly blends indoor and outdoor living with uninterrupted water views.</p><h2>Key Features</h2><ul><li>5 bedrooms, 4 bathrooms</li><li>Double car garage</li><li>Resort-style pool and entertaining terrace</li><li>Floor-to-ceiling glazing throughout</li><li>Smart home automation system</li><li>Sustainable energy solutions including solar</li></ul><h2>Challenge & Solution</h2><p>The sloping site presented significant engineering challenges. Our team designed custom retaining structures and a cantilevered lower level that turned the site's limitations into architectural highlights.</p>",
      category: "Residential",
      status: "completed",
      location: "Mosman, NSW",
      year: "2023",
      client: "Private Client",
      coverImage: "/images/projects/project-1.jpg",
      images: JSON.stringify(["/images/projects/project-1.jpg"]),
      featured: true,
      order: 1,
    },
    {
      title: "Modern Duplex Development",
      slug: "modern-duplex-development",
      shortDescription: "Twin contemporary homes on a single lot — architecturally designed with premium finishes and strong investment returns.",
      description: "<h2>Project Overview</h2><p>This dual-occupancy development in the heart of the Inner West demonstrates how thoughtful design and expert construction can transform a standard residential block into a high-performing investment.</p><h2>Key Features</h2><ul><li>Two x 4-bedroom residences</li><li>Individual strata lots</li><li>Private courtyards for each dwelling</li><li>Premium stone and timber finishes</li><li>Off-street parking for both dwellings</li></ul>",
      category: "Duplex",
      status: "completed",
      location: "Leichhardt, NSW",
      year: "2023",
      client: "Property Investor",
      coverImage: "/images/projects/project-2.jpg",
      images: JSON.stringify(["/images/projects/project-2.jpg"]),
      featured: true,
      order: 2,
    },
    {
      title: "Heritage Knockdown Rebuild",
      slug: "heritage-knockdown-rebuild",
      shortDescription: "A contemporary family home that perfectly complements its heritage streetscape while delivering a fully modern interior.",
      description: "<h2>Project Overview</h2><p>Situated in a heritage conservation area, this knockdown rebuild required careful navigation of council requirements while delivering the thoroughly modern family home our clients dreamed of.</p><h2>Key Features</h2><ul><li>Heritage-sensitive street facade</li><li>Contemporary open-plan interior</li><li>4 bedrooms, home office, media room</li><li>Custom joinery throughout</li><li>Landscaped rear garden</li></ul>",
      category: "Knockdown Rebuild",
      status: "completed",
      location: "Balmain, NSW",
      year: "2022",
      client: "Family Client",
      coverImage: "/images/projects/project-3.jpg",
      images: JSON.stringify(["/images/projects/project-3.jpg"]),
      featured: true,
      order: 3,
    },
    {
      title: "Premium Granny Flat",
      slug: "premium-granny-flat",
      shortDescription: "A self-contained 2-bedroom dwelling delivering $650/week rental income for our client.",
      description: "<h2>Project Overview</h2><p>Proving that smaller doesn't mean lesser, this premium granny flat delivers luxury finishes and smart spatial planning in a compact footprint that maximises every square metre.</p><h2>Key Features</h2><ul><li>2 bedrooms with built-in robes</li><li>Gourmet kitchen with stone benchtops</li><li>Private courtyard and outdoor entertaining</li><li>Separate entrance and utilities</li><li>Completed in 14 weeks</li></ul>",
      category: "Granny Flat",
      status: "completed",
      location: "Ruse, NSW",
      year: "2023",
      client: "Investment Client",
      coverImage: "/images/projects/project-4.jpg",
      images: JSON.stringify(["/images/projects/project-4.jpg"]),
      featured: false,
      order: 4,
    },
    {
      title: "Coastal Renovation & Extension",
      slug: "coastal-renovation-extension",
      shortDescription: "A complete transformation of a 1980s brick home into a stunning coastal contemporary residence.",
      description: "<h2>Project Overview</h2><p>What was once a tired 1980s brick home has been completely reimagined as a stunning coastal property. The project involved a rear extension, full internal renovation, and new pool.</p>",
      category: "Renovation",
      status: "completed",
      location: "Cronulla, NSW",
      year: "2022",
      client: "Private Client",
      coverImage: "/images/projects/project-5.jpg",
      images: JSON.stringify(["/images/projects/project-5.jpg"]),
      featured: false,
      order: 5,
    },
    {
      title: "6-Townhouse Development",
      slug: "six-townhouse-development",
      shortDescription: "A boutique development of 6 architecturally designed townhouses in a high-demand suburb.",
      description: "<h2>Project Overview</h2><p>This boutique townhouse development represents the perfect balance of density and liveability. Six architecturally designed residences, each with private outdoor space, parking, and premium finishes.</p>",
      category: "Multi-Dwelling",
      status: "ongoing",
      location: "Campbelltown, NSW",
      year: "2024",
      client: "Developer Client",
      coverImage: "/images/projects/project-6.jpg",
      images: JSON.stringify(["/images/projects/project-6.jpg"]),
      featured: true,
      order: 6,
    },
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: {},
      create: project,
    });
  }
  console.log("✓ Projects seeded");

  // Testimonials
  const testimonials = [
    {
      name: "Sarah & Michael Thompson",
      company: "Mosman Residence",
      role: "Homeowners",
      text: "Build Demo exceeded every expectation we had. From the initial consultation through to handover, their communication was outstanding and the quality of workmanship is simply exceptional. We couldn't be happier with our dream home.",
      rating: 5,
      order: 1,
    },
    {
      name: "James Chen",
      company: "Property Investor",
      role: "Duplex Owner",
      text: "I've worked with several builders over the years, and Build Demo is in a completely different league. They delivered our duplex on time, within budget, and the quality speaks for itself. Already planning my next project with them.",
      rating: 5,
      order: 2,
    },
    {
      name: "The Patel Family",
      company: "Balmain Rebuild",
      role: "Homeowners",
      text: "Navigating a heritage knockdown rebuild seemed daunting, but the team guided us through every step. Their knowledge of council requirements saved us months of headaches, and the finished home is beyond what we imagined.",
      rating: 5,
      order: 3,
    },
    {
      name: "Amanda Foster",
      company: "Cronulla Renovation",
      role: "Homeowner",
      text: "Our home renovation was a complex project involving a rear extension, new kitchen, and bathrooms. Build Demo managed it all seamlessly. The quality of the finishes is magazine-worthy. Absolute professionals.",
      rating: 5,
      order: 4,
    },
  ];

  for (const testimonial of testimonials) {
    const existing = await prisma.testimonial.findFirst({ where: { name: testimonial.name } });
    if (!existing) {
      await prisma.testimonial.create({ data: testimonial });
    }
  }
  console.log("✓ Testimonials seeded");

  console.log("✅ Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
