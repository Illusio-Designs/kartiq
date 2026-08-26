const { Router } = require('express');
const prisma = require('../utils/prisma');
const { authenticate, requireTenant, requirePermission } = require('../middleware/auth.middleware');
const { audit } = require('../services/audit.service');
const { notifyAdmins, notifyUser } = require('../services/notifications.service');

const router = Router();
router.use(authenticate, requireTenant);

// The permission catalog (see backend/src/scripts/seed.js MODULES) has no
// dedicated `support.*` module, so support-ticket access is gated on the
// closest existing real codes: `settings.read` to view, `settings.update`
// to create/reply/close. Without these guards any authenticated tenant user
// could read and close the whole tenant's tickets.
const canViewTickets = requirePermission('settings.read');
const canManageTickets = requirePermission('settings.update');

// List my tenant's tickets (paginated). Returns { tickets, total, page, limit }.
router.get('/', canViewTickets, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;
  const where = { tenantId: req.tenant.id };
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  res.json({ tickets, total, page, limit });
});

// Get a single ticket with its full thread
router.get('/:id', canViewTickets, async (req, res) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

// Open a ticket
router.post('/', canManageTickets, async (req, res) => {
  try {
    const { subject, priority = 'NORMAL', body, category } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'subject and body are required' });

    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: req.tenant.id,
        userId: req.user.id,
        subject,
        priority,
        category: category || null,
        messages: {
          create: {
            authorId: req.user.id,
            authorName: req.user.name || req.user.email,
            isStaff: false,
            body,
          },
        },
      },
      include: { messages: true },
    });

    audit({ req, action: 'tickets.create', resource: 'ticket', resourceId: ticket.id });
    // Founder inbox: every new tenant ticket lands as a platform notification
    notifyAdmins({
      type: 'ticket.opened',
      category: 'tickets',
      severity: priority === 'URGENT' || priority === 'HIGH' ? 'warning' : 'info',
      title: `New ${priority?.toLowerCase() || 'normal'} ticket: ${subject}`,
      body: body.slice(0, 280),
      link: `/admin/tickets`,
      metadata: { ticketId: ticket.id, tenantId: req.tenant.id, userId: req.user.id },
    });
    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tenant reply
router.post('/:id/reply', canManageTickets, async (req, res) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.status === 'CLOSED') return res.status(400).json({ error: 'Ticket is closed' });

  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user.id,
        authorName: req.user.name || req.user.email,
        isStaff: false,
        body,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === 'PENDING' ? 'OPEN' : ticket.status, updatedAt: new Date() },
    }),
  ]);
  audit({ req, action: 'tickets.reply', resource: 'ticket', resourceId: ticket.id });
  // Tenant replied → ping platform admins so they pick it back up.
  notifyAdmins({
    type: 'ticket.reply.tenant',
    category: 'tickets',
    severity: 'info',
    title: `Tenant reply on: ${ticket.subject}`,
    body: body.slice(0, 280),
    link: `/admin/tickets`,
    metadata: { ticketId: ticket.id, tenantId: req.tenant.id, userId: req.user.id },
  });
  res.json({ ok: true });
});

// Close my own ticket
router.post('/:id/close', canManageTickets, async (req, res) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: 'CLOSED' },
  });
  audit({ req, action: 'tickets.close', resource: 'ticket', resourceId: ticket.id });
  res.json({ ok: true });
});

module.exports = router;
