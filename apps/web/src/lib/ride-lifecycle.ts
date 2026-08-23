import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";

const transitions:Record<string,string[]>={confirmed:['driver_en_route','cancelled','no_show'],driver_en_route:['arrived','cancelled'],arrived:['picked_up','no_show','cancelled'],picked_up:['completed','cancelled'],completed:[],cancelled:[],no_show:[]};
function dbRequired(){const db=getDb();if(!db)throw new Error('Database is not configured');return db;}

export async function transitionRide(input:{rideId:string;actorPersonId:string;toStatus:string;reason?:string|null}){
  const db=dbRequired(),client=await db.connect();let notifications:any[]=[];
  try{
    await client.query('BEGIN');
    const current=await client.query(`select r.*,rr.requester_person_id,rr.passenger_person_id,rr.public_ref as request_ref
      from rides r join ride_requests rr on rr.id=r.ride_request_id where r.id=$1 for update`,[input.rideId]);
    if(!current.rowCount)throw new Error('Ride not found');const ride=current.rows[0];
    if(!(transitions[ride.status]||[]).includes(input.toStatus))throw new Error(`Invalid ride transition: ${ride.status} -> ${input.toStatus}`);
    const guardian=(await client.query(`select 1 from guardian_relationships where guardian_person_id=$1 and minor_person_id=$2 and can_approve_rides=true limit 1`,[input.actorPersonId,ride.passenger_person_id])).rowCount>0;
    const actorIsDriver=input.actorPersonId===ride.driver_person_id,actorManagesPrimary=input.actorPersonId===ride.requester_person_id||guardian;
    if(!actorIsDriver&&!actorManagesPrimary)throw new Error('Person is not authorized to update this ride');
    if(['driver_en_route','arrived','picked_up','completed','no_show'].includes(input.toStatus)&&!actorIsDriver)throw new Error('Only the assigned driver can perform this ride update');

    const assignments=(await client.query(`select a.ride_request_id,a.seats_reserved,rr.requester_person_id,rr.passenger_person_id,rr.public_ref
      from ride_request_assignments a join ride_requests rr on rr.id=a.ride_request_id
      where a.ride_id=$1 and a.status='confirmed' for update`,[ride.id])).rows;
    if(input.toStatus==='no_show'&&assignments.length>1)throw new Error('This is a pooled ride. Record no-show for the individual passenger instead of ending the entire carpool.');

    if(input.toStatus==='picked_up'){
      const required=(await client.query(`select case when o.pickup_verification_mode='required' or exists(select 1 from guardian_relationships gr where gr.minor_person_id=rr.passenger_person_id and gr.require_verified_pickup=true) then true else false end as required from rides r join ride_requests rr on rr.id=r.ride_request_id join organizations o on o.id=r.organization_id where r.id=$1`,[ride.id])).rows[0]?.required;
      if(required){const verified=await client.query(`select 1 from ride_pickup_handshakes where ride_id=$1 and status='verified' limit 1`,[ride.id]);if(!verified.rowCount)throw new Error('Verified pickup is required before marking this rider picked up');}
    }

    if(input.toStatus==='cancelled'){
      const prePickup=['confirmed','driver_en_route','arrived'].includes(ride.status);
      const driverCancelled=actorIsDriver;
      for(const assignment of assignments){
        const isPrimary=assignment.ride_request_id===ride.ride_request_id;
        let requestStatus='cancelled';
        if(prePickup){
          if(driverCancelled)requestStatus='open';
          else if(!isPrimary)requestStatus='open';
        }
        await client.query(`update ride_requests set status=$2,cancelled_reason=case when $2='cancelled' then $3 else null end,updated_at=now() where id=$1`,[assignment.ride_request_id,requestStatus,input.reason||null]);
        await client.query(`update ride_request_assignments set status='cancelled',updated_at=now() where ride_id=$1 and ride_request_id=$2`,[ride.id,assignment.ride_request_id]);
        await client.query(`update ride_passengers set assignment_status='cancelled' where ride_id=$1 and ride_request_id=$2`,[ride.id,assignment.ride_request_id]);
        await client.query(`update ride_stops set status='skipped',updated_at=now() where ride_id=$1 and ride_request_id=$2 and status in ('planned','arrived')`,[ride.id,assignment.ride_request_id]);
        notifications.push({personId:assignment.requester_person_id,requestStatus});
      }
      await client.query(`update rides set seats_reserved=0 where id=$1`,[ride.id]);
      await client.query(`update ride_offers set status=$2,updated_at=now() where id=$1 and status='accepted'`,[ride.accepted_offer_id,driverCancelled?'withdrawn':'declined']);
    }

    if(input.toStatus==='no_show'){
      const assignment=assignments[0];if(!assignment)throw new Error('Ride has no active passenger assignment');
      await client.query(`update ride_request_assignments set status='no_show',updated_at=now() where ride_id=$1 and ride_request_id=$2`,[ride.id,assignment.ride_request_id]);
      await client.query(`update ride_passengers set assignment_status='no_show',no_show=true where ride_id=$1 and ride_request_id=$2`,[ride.id,assignment.ride_request_id]);
      await client.query(`update ride_stops set status='skipped',updated_at=now() where ride_id=$1 and ride_request_id=$2 and status in ('planned','arrived')`,[ride.id,assignment.ride_request_id]);
      await client.query(`update ride_requests set status='cancelled',cancelled_reason=coalesce($2,'Passenger reported as no-show'),updated_at=now() where id=$1`,[assignment.ride_request_id,input.reason||null]);
      notifications.push({personId:assignment.requester_person_id,requestStatus:'no_show'});
    }

    const result=await client.query(`update rides set status=$1,
      driver_arrived_at=case when $1='arrived' then now() else driver_arrived_at end,
      picked_up_at=case when $1='picked_up' then now() else picked_up_at end,
      completed_at=case when $1='completed' then now() else completed_at end,
      cancelled_at=case when $1='cancelled' then now() else cancelled_at end,
      cancellation_reason=case when $1='cancelled' then $2 else cancellation_reason end,
      no_show_at=case when $1='no_show' then now() else no_show_at end,
      no_show_reported_by_person_id=case when $1='no_show' then $3 else no_show_reported_by_person_id end,
      no_show_reason=case when $1='no_show' then $2 else no_show_reason end,updated_at=now() where id=$4 returning *`,[input.toStatus,input.reason||null,input.actorPersonId,input.rideId]);
    await client.query(`insert into ride_status_events(ride_id,ride_request_id,actor_person_id,event_type,from_status,to_status,metadata) values($1,$2,$3,'ride_status_changed',$4,$5,$6::jsonb)`,[ride.id,ride.ride_request_id,input.actorPersonId,ride.status,input.toStatus,JSON.stringify({reason:input.reason||null,pooledAssignmentCount:assignments.length,cancelledBy:input.toStatus==='cancelled'?(actorIsDriver?'driver':'requester'):null})]);
    await client.query('COMMIT');

    if(input.toStatus==='driver_en_route'||input.toStatus==='arrived'){
      await routeNotification({notificationType:'driver_arriving',title:'Driver update',body:input.toStatus==='driver_en_route'?'Your driver is on the way.':'Your driver has arrived.',personId:ride.requester_person_id,organizationId:ride.organization_id,url:`/rides/${ride.public_ref}`}).catch(()=>{});
    }else if(input.toStatus==='cancelled'){
      const unique=new Map<string,any>();for(const n of notifications)if(n.personId)unique.set(n.personId,n);
      await Promise.allSettled(Array.from(unique.values()).map(n=>routeNotification({notificationType:'last_minute_cancellation',title:n.requestStatus==='open'?'Ride cancelled - request reopened':'Ride cancelled',body:n.requestStatus==='open'?'This carpool was cancelled. Your ride request has been reopened so another driver can help.':'Your BandWagon ride was cancelled.',personId:n.personId,organizationId:ride.organization_id,url:'/app/rides'})));
      if(!actorIsDriver)await routeNotification({notificationType:'last_minute_cancellation',title:'Ride cancelled by rider',body:'The primary rider cancelled this carpool. Other affected ride requests were reopened.',personId:ride.driver_person_id,organizationId:ride.organization_id,url:'/app/driver'}).catch(()=>{});
    }else if(input.toStatus==='no_show'&&notifications[0]?.personId){
      await routeNotification({notificationType:'ride_no_show',title:'Ride marked no-show',body:'The driver marked this ride as a no-show. No rating or punitive score is applied automatically.',personId:notifications[0].personId,organizationId:ride.organization_id,url:'/app/rides'}).catch(()=>{});
    }
    return result.rows[0];
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
