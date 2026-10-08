// Per-step events copied into flat float buffers, one buffer per kind, so the
// frontend reads a whole step through a single HEAPF32 view. Slots are stored
// as floats, exact below 2^24.
#include "bx.h"

#include <stdlib.h>
#include <string.h>

// Every world owns its own set of buffers, so stepping or reading one world never
// overwrites the records another world's readers still point at.
typedef struct bxEventBuffers
{
	bxFloatBuffer move;
	bxFloatBuffer contactBegin;
	bxFloatBuffer contactEnd;
	bxFloatBuffer contactHit;
	bxFloatBuffer sensorBegin;
	bxFloatBuffer sensorEnd;
	bxFloatBuffer jointEvents;
} bxEventBuffers;

static bxEventBuffers** s_buffers;
static int s_bufferCapacity;

static bxEventBuffers* bxBuffers( int slot )
{
	if ( slot < 0 )
	{
		slot = 0;
	}
	if ( slot >= s_bufferCapacity )
	{
		int capacity = s_bufferCapacity == 0 ? 8 : s_bufferCapacity;
		while ( capacity <= slot )
		{
			capacity *= 2;
		}
		s_buffers = (bxEventBuffers**)realloc( s_buffers, (size_t)capacity * sizeof( bxEventBuffers* ) );
		memset( s_buffers + s_bufferCapacity, 0, (size_t)( capacity - s_bufferCapacity ) * sizeof( bxEventBuffers* ) );
		s_bufferCapacity = capacity;
	}
	if ( s_buffers[slot] == NULL )
	{
		s_buffers[slot] = (bxEventBuffers*)calloc( 1, sizeof( bxEventBuffers ) );
	}
	return s_buffers[slot];
}

/// Frees a destroyed world's buffers.
void bxEvents_FreeWorld( int slot )
{
	if ( slot < 0 || slot >= s_bufferCapacity || s_buffers[slot] == NULL )
	{
		return;
	}
	bxEventBuffers* eb = s_buffers[slot];
	free( eb->move.data );
	free( eb->contactBegin.data );
	free( eb->contactEnd.data );
	free( eb->contactHit.data );
	free( eb->sensorBegin.data );
	free( eb->sensorEnd.data );
	free( eb->jointEvents.data );
	free( eb );
	s_buffers[slot] = NULL;
}

BX_EXPORT float* bx_MoveEventsPtr( int slot )
{
	return bxBuffers( slot )->move.data;
}

BX_EXPORT float* bx_ContactBeginEventsPtr( int slot )
{
	return bxBuffers( slot )->contactBegin.data;
}

BX_EXPORT float* bx_ContactEndEventsPtr( int slot )
{
	return bxBuffers( slot )->contactEnd.data;
}

BX_EXPORT float* bx_ContactHitEventsPtr( int slot )
{
	return bxBuffers( slot )->contactHit.data;
}

BX_EXPORT float* bx_SensorBeginEventsPtr( int slot )
{
	return bxBuffers( slot )->sensorBegin.data;
}

BX_EXPORT float* bx_SensorEndEventsPtr( int slot )
{
	return bxBuffers( slot )->sensorEnd.data;
}

BX_EXPORT float* bx_JointEventsPtr( int slot )
{
	return bxBuffers( slot )->jointEvents.data;
}

/// record: [body, px, py, pz, qx, qy, qz, qw, fellAsleep]
BX_EXPORT int bx_World_GetMoveEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->move.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3BodyEvents events = b3World_GetBodyEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->move, events.moveCount * BX_STRIDE_MOVE );
	int count = 0;
	for ( int i = 0; i < events.moveCount; ++i )
	{
		const b3BodyMoveEvent* e = events.moveEvents + i;
		int body = (int)(intptr_t)e->userData;
		if ( body <= 0 )
		{
			continue;
		}
		out[0] = (float)body;
		out[1] = e->transform.p.x;
		out[2] = e->transform.p.y;
		out[3] = e->transform.p.z;
		out[4] = e->transform.q.v.x;
		out[5] = e->transform.q.v.y;
		out[6] = e->transform.q.v.z;
		out[7] = e->transform.q.s;
		out[8] = e->fellAsleep ? 1.0f : 0.0f;
		out += BX_STRIDE_MOVE;
		count += 1;
	}
	eb->move.count = count;
	return count;
}

// The contact point, normal (from shape A to shape B) and total normal impulse
// of a begin touch event, summarised from the contact's first manifold.
static void bxWriteBeginTouchData( float* out, b3ContactId contactId, b3ShapeId shapeIdA )
{
	memset( out, 0, 9 * sizeof( float ) );
	if ( b3Contact_IsValid( contactId ) == false )
	{
		return;
	}
	b3ContactData data = b3Contact_GetData( contactId );
	if ( data.manifoldCount <= 0 || data.manifolds[0].pointCount <= 0 )
	{
		out[8] = (float)data.manifoldCount;
		return;
	}
	const b3Manifold* manifold = data.manifolds;
	// manifold anchors are relative to the center of mass of the contact's body A, which may be the event's shape B
	int flipped = B3_ID_EQUALS( data.shapeIdA, shapeIdA ) == false;
	b3Vec3 center = b3Body_GetWorldCenter( b3Shape_GetBody( data.shapeIdA ) );
	b3Vec3 anchor = b3Vec3_zero;
	float impulse = 0.0f;
	for ( int i = 0; i < manifold->pointCount; ++i )
	{
		anchor = b3Add( anchor, manifold->points[i].anchorA );
		impulse += manifold->points[i].totalNormalImpulse;
	}
	anchor = b3MulSV( 1.0f / (float)manifold->pointCount, anchor );
	b3Vec3 point = b3Add( center, anchor );
	b3Vec3 normal = flipped ? b3Neg( manifold->normal ) : manifold->normal;
	out[0] = point.x;
	out[1] = point.y;
	out[2] = point.z;
	out[3] = normal.x;
	out[4] = normal.y;
	out[5] = normal.z;
	out[6] = impulse;
	out[7] = (float)manifold->pointCount;
	out[8] = (float)data.manifoldCount;
}

/// record: [shapeA, shapeB, bodyA, bodyB, px, py, pz, nx, ny, nz, totalNormalImpulse, pointCount, manifoldCount]
BX_EXPORT int bx_World_GetContactBeginEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->contactBegin.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3ContactEvents events = b3World_GetContactEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->contactBegin, events.beginCount * BX_STRIDE_CONTACT_BEGIN );
	int count = 0;
	for ( int i = 0; i < events.beginCount; ++i )
	{
		const b3ContactBeginTouchEvent* e = events.beginEvents + i;
		out[0] = (float)bxShapeSlotOf( e->shapeIdA );
		out[1] = (float)bxShapeSlotOf( e->shapeIdB );
		out[2] = (float)bxBodySlotOfShape( e->shapeIdA );
		out[3] = (float)bxBodySlotOfShape( e->shapeIdB );
		bxWriteBeginTouchData( out + 4, e->contactId, e->shapeIdA );
		out += BX_STRIDE_CONTACT_BEGIN;
		count += 1;
	}
	eb->contactBegin.count = count;
	return count;
}

/// record: [shapeA, shapeB, bodyA, bodyB], 0 for a shape that no longer exists
BX_EXPORT int bx_World_GetContactEndEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->contactEnd.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3ContactEvents events = b3World_GetContactEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->contactEnd, events.endCount * BX_STRIDE_CONTACT_END );
	for ( int i = 0; i < events.endCount; ++i )
	{
		const b3ContactEndTouchEvent* e = events.endEvents + i;
		out[0] = (float)bxShapeSlotOf( e->shapeIdA );
		out[1] = (float)bxShapeSlotOf( e->shapeIdB );
		out[2] = (float)bxBodySlotOfShape( e->shapeIdA );
		out[3] = (float)bxBodySlotOfShape( e->shapeIdB );
		out += BX_STRIDE_CONTACT_END;
	}
	eb->contactEnd.count = events.endCount;
	return events.endCount;
}

/// record: [shapeA, shapeB, bodyA, bodyB, px, py, pz, nx, ny, nz, approachSpeed]
BX_EXPORT int bx_World_GetContactHitEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->contactHit.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3ContactEvents events = b3World_GetContactEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->contactHit, events.hitCount * BX_STRIDE_CONTACT_HIT );
	for ( int i = 0; i < events.hitCount; ++i )
	{
		const b3ContactHitEvent* e = events.hitEvents + i;
		out[0] = (float)bxShapeSlotOf( e->shapeIdA );
		out[1] = (float)bxShapeSlotOf( e->shapeIdB );
		out[2] = (float)bxBodySlotOfShape( e->shapeIdA );
		out[3] = (float)bxBodySlotOfShape( e->shapeIdB );
		out[4] = e->point.x;
		out[5] = e->point.y;
		out[6] = e->point.z;
		out[7] = e->normal.x;
		out[8] = e->normal.y;
		out[9] = e->normal.z;
		out[10] = e->approachSpeed;
		out += BX_STRIDE_CONTACT_HIT;
	}
	eb->contactHit.count = events.hitCount;
	return events.hitCount;
}

/// record: [sensorShape, visitorShape, sensorBody, visitorBody]
BX_EXPORT int bx_World_GetSensorBeginEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->sensorBegin.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3SensorEvents events = b3World_GetSensorEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->sensorBegin, events.beginCount * BX_STRIDE_SENSOR );
	for ( int i = 0; i < events.beginCount; ++i )
	{
		const b3SensorBeginTouchEvent* e = events.beginEvents + i;
		out[0] = (float)bxShapeSlotOf( e->sensorShapeId );
		out[1] = (float)bxShapeSlotOf( e->visitorShapeId );
		out[2] = (float)bxBodySlotOfShape( e->sensorShapeId );
		out[3] = (float)bxBodySlotOfShape( e->visitorShapeId );
		out += BX_STRIDE_SENSOR;
	}
	eb->sensorBegin.count = events.beginCount;
	return events.beginCount;
}

/// record: [sensorShape, visitorShape, sensorBody, visitorBody], 0 for a shape that no longer exists
BX_EXPORT int bx_World_GetSensorEndEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->sensorEnd.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3SensorEvents events = b3World_GetSensorEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->sensorEnd, events.endCount * BX_STRIDE_SENSOR );
	for ( int i = 0; i < events.endCount; ++i )
	{
		const b3SensorEndTouchEvent* e = events.endEvents + i;
		out[0] = (float)bxShapeSlotOf( e->sensorShapeId );
		out[1] = (float)bxShapeSlotOf( e->visitorShapeId );
		out[2] = (float)bxBodySlotOfShape( e->sensorShapeId );
		out[3] = (float)bxBodySlotOfShape( e->visitorShapeId );
		out += BX_STRIDE_SENSOR;
	}
	eb->sensorEnd.count = events.endCount;
	return events.endCount;
}

/// record: [joint]
BX_EXPORT int bx_World_GetJointEvents( int slot )
{
	bxEventBuffers* eb = bxBuffers( slot );
	b3WorldId worldId = bxWorldId( slot );
	eb->jointEvents.count = 0;
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3JointEvents events = b3World_GetJointEvents( worldId );
	float* out = bxFloatBuffer_Reserve( &eb->jointEvents, events.count * BX_STRIDE_JOINT_EVENT );
	for ( int i = 0; i < events.count; ++i )
	{
		out[i] = (float)(int)(intptr_t)events.jointEvents[i].userData;
	}
	eb->jointEvents.count = events.count;
	return events.count;
}
