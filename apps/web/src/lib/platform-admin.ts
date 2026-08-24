import { getDb } from "@/lib/db";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function pct(n:number,d:number){return d>0?Math.round(n/d*100):0;}

export async function getPlatformAdminOverview(){
  const db=dbRequired();
  const [orgs,users,members,drivers,rides,requests,events,routeAssist,pickup,ai,push,notifications,docs,support,aiFailures,notificationFailures]=await Promise.all([
    db.query(`select count(*)::int as total,count(*) filter(where status='active')::int as active from organizations`),
    db.query(`select count(*)::int as total,count(*) filter(where status='active')::int as active,count(*) filter(where last_login_at>=now()-interval '7 days')::int as wau,count(*) filter(where last_login_at>=now()-interval '30 days')::int as mau,count(*) filter(where created_at>=now()-interval '30 days')::int as new30 from user_accounts`),
    db.query(`select count(distinct person_id)::int as people,count(distinct organization_id)::int as orgs from memberships where status='active' and group_id is null`),
    db.query(`select count(*) filter(where status='active')::int as active,count(*) filter(where status='active' and route_assist_enabled=true)::int as route_assist_enabled from driver_organization_settings`),
    db.query(`select count(*) filter(where created_at>=now()-interval '30 days')::int as rides30,count(*) filter(where created_at>=now()-interval '30 days' and status='completed')::int as completed30,count(distinct organization_id) filter(where created_at>=now()-interval '30 days')::int as orgs30 from rides`),
    db.query(`select count(*) filter(where created_at>=now()-interval '30 days')::int as requests30,count(*) filter(where created_at>=now()-interval '30 days' and status='matched')::int as matched30,count(distinct organization_id) filter(where created_at>=now()-interval '30 days')::int as orgs30 from ride_requests`),
    db.query(`select count(*) filter(where created_at>=now()-interval '30 days')::int as events30,count(distinct organization_id) filter(where created_at>=now()-interval '30 days')::int as orgs30 from events`),
    db.query(`select count(*) filter(where created_at>=now()-interval '30 days')::int as recommendations30,count(*) filter(where created_at>=now()-interval '30 days' and status='accepted')::int as accepted30,count(distinct driver_person_id) filter(where created_at>=now()-interval '30 days')::int as drivers30 from driver_ride_recommendations`),
    db.query(`select count(*) filter(where created_at>=now()-interval '30 days')::int as attempts30,count(*) filter(where created_at>=now()-interval '30 days' and status='verified')::int as verified30,count(distinct organization_id) filter(where created_at>=now()-interval '30 days')::int as orgs30 from ride_pickup_handshakes`),
    db.query(`select count(*) filter(where ai_enabled=true)::int as enabled_orgs,count(*)::int as configured_orgs,(select count(*)::int from ai_jobs where created_at>=now()-interval '30 days') as jobs30,(select count(*)::int from ai_jobs where created_at>=now()-interval '30 days' and status='completed') as completed30 from organization_ai_settings`),
    db.query(`select count(distinct person_id)::int as people,count(*)::int as devices from push_subscriptions where status='active' and revoked_at is null`),
    db.query(`select count(*) filter(where created_at>=now()-interval '30 days')::int as total30,count(*) filter(where created_at>=now()-interval '30 days' and channel in ('sms','rcs'))::int as sms30,count(*) filter(where created_at>=now()-interval '30 days' and channel='push')::int as push30,count(*) filter(where created_at>=now()-interval '30 days' and status in ('failed','undelivered'))::int as failed30 from notification_deliveries`),
    db.query(`select count(distinct person_id) filter(where status in ('uploaded','processing','ready'))::int as people,count(*) filter(where status in ('uploaded','processing','ready'))::int as documents from person_documents`),
    db.query(`select count(distinct organization_id) filter(where status='paid' and created_at>=now()-interval '30 days')::int as orgs30,count(*) filter(where status='paid' and created_at>=now()-interval '30 days')::int as contributions30,coalesce(sum(amount_cents) filter(where status='paid' and created_at>=now()-interval '30 days'),0)::int as cents30 from support_contributions`),
    db.query(`select count(*)::int as count from ai_jobs where created_at>=now()-interval '24 hours' and status='failed'`),
    db.query(`select count(*)::int as count from notification_deliveries where created_at>=now()-interval '24 hours' and status in ('failed','undelivered')`)
  ]);

  const o=orgs.rows[0]||{},u=users.rows[0]||{},d=drivers.rows[0]||{},r=rides.rows[0]||{},rr=requests.rows[0]||{},ev=events.rows[0]||{},ra=routeAssist.rows[0]||{},ph=pickup.rows[0]||{},a=ai.rows[0]||{},ps=push.rows[0]||{},n=notifications.rows[0]||{},doc=docs.rows[0]||{},sp=support.rows[0]||{};
  const activeOrgs=Number(o.active||0),activeUsers=Number(u.active||0),activeDrivers=Number(d.active||0);

  const features=[
    {key:'ride_coordination',label:'Ride Coordination',numerator:Number(rr.orgs30||0),denominator:activeOrgs,percent:pct(Number(rr.orgs30||0),activeOrgs),usage30:Number(rr.requests30||0),detail:`${Number(rr.matched30||0)} matched requests in 30d`},
    {key:'events',label:'Events',numerator:Number(ev.orgs30||0),denominator:activeOrgs,percent:pct(Number(ev.orgs30||0),activeOrgs),usage30:Number(ev.events30||0),detail:'organizations creating events in 30d'},
    {key:'route_assist',label:'RouteAssist',numerator:Number(d.route_assist_enabled||0),denominator:activeDrivers,percent:pct(Number(d.route_assist_enabled||0),activeDrivers),usage30:Number(ra.recommendations30||0),detail:`${Number(ra.accepted30||0)} accepted recommendations in 30d`},
    {key:'verified_pickup',label:'Verified Pickup',numerator:Number(ph.verified30||0),denominator:Number(ph.attempts30||0),percent:pct(Number(ph.verified30||0),Number(ph.attempts30||0)),usage30:Number(ph.attempts30||0),detail:`${Number(ph.orgs30||0)} organizations used it in 30d`},
    {key:'ai',label:'AI Features',numerator:Number(a.enabled_orgs||0),denominator:activeOrgs,percent:pct(Number(a.enabled_orgs||0),activeOrgs),usage30:Number(a.jobs30||0),detail:`${Number(a.completed30||0)} completed AI jobs in 30d`},
    {key:'push',label:'Push Notifications',numerator:Number(ps.people||0),denominator:activeUsers,percent:pct(Number(ps.people||0),activeUsers),usage30:Number(n.push30||0),detail:`${Number(ps.devices||0)} active devices`},
    {key:'driver_vault',label:'Driver Credential Vault',numerator:Number(doc.people||0),denominator:activeDrivers,percent:pct(Number(doc.people||0),activeDrivers),usage30:Number(doc.documents||0),detail:'drivers with active credential documents'},
    {key:'community_support',label:'Community Support',numerator:Number(sp.orgs30||0),denominator:activeOrgs,percent:pct(Number(sp.orgs30||0),activeOrgs),usage30:Number(sp.contributions30||0),detail:`$${(Number(sp.cents30||0)/100).toFixed(2)} contributed in 30d`},
  ];

  return {
    generatedAt:new Date().toISOString(),
    headline:{activeOrganizations:activeOrgs,totalOrganizations:Number(o.total||0),activeUsers,weeklyActiveUsers:Number(u.wau||0),monthlyActiveUsers:Number(u.mau||0),newUsers30:Number(u.new30||0),activeDrivers,rides30:Number(r.rides30||0),completedRides30:Number(r.completed30||0)},
    features,
    messaging:{total30:Number(n.total30||0),smsRcs30:Number(n.sms30||0),smsSharePercent:pct(Number(n.sms30||0),Number(n.total30||0)),failed30:Number(n.failed30||0)},
    health:{aiFailures24:Number(aiFailures.rows[0]?.count||0),notificationFailures24:Number(notificationFailures.rows[0]?.count||0)},
  };
}
