// Touching contacts of a body or shape, flattened to one record per manifold.
#include "bx.h"

#include <stdlib.h>

#define BX_CONTACT_HEADER 14
#define BX_CONTACT_POINT_WORDS 10
#define BX_CONTACT_WORDS ( BX_CONTACT_HEADER + 4 * BX_CONTACT_POINT_WORDS )

static bxWord* s_records;
static int s_recordCount;
static int s_recordCapacity;

static bxWord* bxNextRecord( void )
{
	if ( s_recordCount >= s_recordCapacity )
	{
		s_recordCapacity = s_recordCapacity == 0 ? 32 : s_recordCapacity * 2;
		s_records = (bxWord*)realloc( s_records, (size_t)s_recordCapacity * BX_CONTACT_WORDS * sizeof( bxWord ) );
	}
	bxWord* r = s_records + (size_t)s_recordCount * BX_CONTACT_WORDS;
	s_recordCount += 1;
	for ( int i = 0; i < BX_CONTACT_WORDS; ++i )
	{
		r[i].u = 0;
	}
	return r;
}

// record: [shapeA, shapeB, pointCount, nx, ny, nz, twistImpulse, fx, fy, fz, rx, ry, rz, manifoldCount]
// then up to 4 points: [x, y, z, separation, normalImpulse, totalNormalImpulse, normalVelocity, persisted, featureId, triangle]
static void bxAppendContact( const b3ContactData* data )
{
	b3Vec3 center = b3Body_GetWorldCenter( b3Shape_GetBody( data->shapeIdA ) );
	for ( int m = 0; m < data->manifoldCount; ++m )
	{
		const b3Manifold* manifold = data->manifolds + m;
		bxWord* r = bxNextRecord();
		r[0].i = bxShapeSlotOf( data->shapeIdA );
		r[1].i = bxShapeSlotOf( data->shapeIdB );
		r[2].i = manifold->pointCount;
		r[3].f = manifold->normal.x;
		r[4].f = manifold->normal.y;
		r[5].f = manifold->normal.z;
		r[6].f = manifold->twistImpulse;
		r[7].f = manifold->frictionImpulse.x;
		r[8].f = manifold->frictionImpulse.y;
		r[9].f = manifold->frictionImpulse.z;
		r[10].f = manifold->rollingImpulse.x;
		r[11].f = manifold->rollingImpulse.y;
		r[12].f = manifold->rollingImpulse.z;
		r[13].i = data->manifoldCount;
		for ( int i = 0; i < manifold->pointCount && i < 4; ++i )
		{
			const b3ManifoldPoint* point = manifold->points + i;
			bxWord* p = r + BX_CONTACT_HEADER + i * BX_CONTACT_POINT_WORDS;
			b3Vec3 world = b3Add( center, point->anchorA );
			p[0].f = world.x;
			p[1].f = world.y;
			p[2].f = world.z;
			p[3].f = point->separation;
			p[4].f = point->normalImpulse;
			p[5].f = point->totalNormalImpulse;
			p[6].f = point->normalVelocity;
			p[7].i = point->persisted ? 1 : 0;
			p[8].u = point->featureId;
			p[9].i = point->triangleIndex;
		}
	}
}

/// Pointer to the records, 54 words each. See bx_Contacts_Stride.
BX_EXPORT bxWord* bx_Contacts_Buffer( void )
{
	return s_records;
}

BX_EXPORT int bx_Contacts_Stride( void )
{
	return BX_CONTACT_WORDS;
}

/// Returns the record count (one per manifold).
BX_EXPORT int bx_Body_GetContacts( int slot )
{
	s_recordCount = 0;
	b3BodyId bodyId = bxBodyId( slot );
	if ( B3_IS_NULL( bodyId ) )
	{
		return 0;
	}
	int capacity = b3Body_GetContactCapacity( bodyId );
	if ( capacity <= 0 )
	{
		return 0;
	}
	b3ContactData* contacts = (b3ContactData*)malloc( (size_t)capacity * sizeof( b3ContactData ) );
	int count = b3Body_GetContactData( bodyId, contacts, capacity );
	for ( int i = 0; i < count; ++i )
	{
		bxAppendContact( contacts + i );
	}
	free( contacts );
	return s_recordCount;
}

BX_EXPORT int bx_Shape_GetContacts( int slot )
{
	s_recordCount = 0;
	b3ShapeId shapeId = bxShapeId( slot );
	if ( B3_IS_NULL( shapeId ) )
	{
		return 0;
	}
	int capacity = b3Shape_GetContactCapacity( shapeId );
	if ( capacity <= 0 )
	{
		return 0;
	}
	b3ContactData* contacts = (b3ContactData*)malloc( (size_t)capacity * sizeof( b3ContactData ) );
	int count = b3Shape_GetContactData( shapeId, contacts, capacity );
	for ( int i = 0; i < count; ++i )
	{
		bxAppendContact( contacts + i );
	}
	free( contacts );
	return s_recordCount;
}
