// World queries. The closest ray cast writes its hit to scratch.
#include "bx.h"

static b3QueryFilter bxQueryFilter( uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3QueryFilter filter = b3DefaultQueryFilter();
	filter.categoryBits = (uint64_t)categoryLo | ( (uint64_t)categoryHi << 32 );
	filter.maskBits = (uint64_t)maskLo | ( (uint64_t)maskHi << 32 );
	return filter;
}

/// Returns the shape slot hit, 0 for a miss.
/// scratch: [px, py, pz, nx, ny, nz, fraction, body (i32), triangleIndex (i32), childIndex (i32), materialLo (u32),
/// materialHi (u32)]
BX_EXPORT int bx_World_CastRayClosest( int slot, float ox, float oy, float oz, float dx, float dy, float dz, uint32_t categoryLo,
									   uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3RayResult result =
		b3World_CastRayClosest( worldId, origin, translation, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ) );
	if ( result.hit == false )
	{
		return 0;
	}
	int shape = bxShapeSlotOf( result.shapeId );
	if ( shape == 0 )
	{
		return 0;
	}
	bxScratchVec3( 0, result.point );
	bxScratchVec3( 3, result.normal );
	bx_scratch[6].f = result.fraction;
	bx_scratch[7].i = bxBodySlotOfShape( result.shapeId );
	bx_scratch[8].i = result.triangleIndex;
	bx_scratch[9].i = result.childIndex;
	bx_scratch[10].u = (uint32_t)( result.userMaterialId & 0xffffffffu );
	bx_scratch[11].u = (uint32_t)( result.userMaterialId >> 32 );
	return shape;
}

// ---------------------------------------------------------------------------
// Multi-hit queries. Results live in module-level buffers the frontend reads
// in place; they are valid until the next query.
// ---------------------------------------------------------------------------

#include <stdlib.h>
#include <string.h>

#define BX_HIT_WORDS 13

static bxWord* s_hits;
static int s_hitCount;
static int s_hitCapacity;
static int* s_overlaps;
static int s_overlapCount;
static int s_overlapCapacity;

enum bxCastMode
{
	BX_CAST_ALL = 0,	 // every hit, nearest first
	BX_CAST_CLOSEST = 1, // only the nearest hit
	BX_CAST_ANY = 2,	 // stop at the first hit found
};

typedef struct bxCastContext
{
	int mode;
} bxCastContext;

static bxWord* bxHitRecord( int index )
{
	return s_hits + (size_t)index * BX_HIT_WORDS;
}

static float bxCastCallback( b3ShapeId shapeId, b3Pos point, b3Vec3 normal, float fraction, uint64_t userMaterialId,
							 int triangleIndex, int childIndex, void* context )
{
	bxCastContext* ctx = (bxCastContext*)context;
	int shape = bxShapeSlotOf( shapeId );
	if ( shape == 0 )
	{
		return -1.0f;
	}
	int index = s_hitCount;
	if ( ctx->mode == BX_CAST_CLOSEST && s_hitCount > 0 )
	{
		if ( fraction >= bxHitRecord( 0 )[8].f )
		{
			return fraction;
		}
		index = 0;
	}
	else
	{
		if ( s_hitCount >= s_hitCapacity )
		{
			s_hitCapacity = s_hitCapacity == 0 ? 64 : s_hitCapacity * 2;
			s_hits = (bxWord*)realloc( s_hits, (size_t)s_hitCapacity * BX_HIT_WORDS * sizeof( bxWord ) );
		}
		s_hitCount += 1;
	}
	bxWord* r = bxHitRecord( index );
	r[0].i = shape;
	r[1].i = bxBodySlotOfShape( shapeId );
	r[2].f = point.x;
	r[3].f = point.y;
	r[4].f = point.z;
	r[5].f = normal.x;
	r[6].f = normal.y;
	r[7].f = normal.z;
	r[8].f = fraction;
	r[9].i = triangleIndex;
	r[10].i = childIndex;
	r[11].u = (uint32_t)( userMaterialId & 0xffffffffu );
	r[12].u = (uint32_t)( userMaterialId >> 32 );
	if ( ctx->mode == BX_CAST_ANY )
	{
		return 0.0f;
	}
	// all: do not clip the ray. closest: clip to the current nearest.
	return ctx->mode == BX_CAST_CLOSEST ? fraction : 1.0f;
}

static int bxCompareHits( const void* a, const void* b )
{
	float fa = ( (const bxWord*)a )[8].f;
	float fb = ( (const bxWord*)b )[8].f;
	return fa < fb ? -1 : ( fa > fb ? 1 : 0 );
}

static int bxFinishCast( int mode )
{
	if ( mode == BX_CAST_ALL && s_hitCount > 1 )
	{
		qsort( s_hits, (size_t)s_hitCount, BX_HIT_WORDS * sizeof( bxWord ), bxCompareHits );
	}
	return s_hitCount;
}

/// f32/i32 index of the hit buffer: 13 words per hit
/// [shape, body, px, py, pz, nx, ny, nz, fraction, triangle, child, materialLo, materialHi]
BX_EXPORT bxWord* bx_Query_Hits( void )
{
	return s_hits;
}

BX_EXPORT int* bx_Query_Overlaps( void )
{
	return s_overlaps;
}

BX_EXPORT int bx_Query_HitWords( void )
{
	return BX_HIT_WORDS;
}

/// Returns the hit count. mode: 0 all (sorted nearest first), 1 closest, 2 any.
BX_EXPORT int bx_World_CastRay( int slot, float ox, float oy, float oz, float dx, float dy, float dz, uint32_t categoryLo,
								uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi, int mode )
{
	s_hitCount = 0;
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	bxCastContext ctx = { mode };
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3World_CastRay( worldId, origin, translation, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ), bxCastCallback,
					 &ctx );
	return bxFinishCast( mode );
}

/// points: xyz triples in wasm memory (1 to B3_MAX_SHAPE_CAST_POINTS), radius is the external radius.
BX_EXPORT int bx_World_CastShape( int slot, const float* points, int pointCount, float radius, float ox, float oy, float oz,
								  float dx, float dy, float dz, uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo,
								  uint32_t maskHi, int mode )
{
	s_hitCount = 0;
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) || points == NULL || pointCount < 1 || pointCount > B3_MAX_SHAPE_CAST_POINTS )
	{
		return 0;
	}
	b3ShapeProxy proxy = { (const b3Vec3*)points, pointCount, radius };
	bxCastContext ctx = { mode };
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3World_CastShape( worldId, origin, &proxy, translation, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ),
					   bxCastCallback, &ctx );
	return bxFinishCast( mode );
}

static bool bxOverlapCallback( b3ShapeId shapeId, void* context )
{
	(void)context;
	int shape = bxShapeSlotOf( shapeId );
	if ( shape == 0 )
	{
		return true;
	}
	if ( s_overlapCount >= s_overlapCapacity )
	{
		s_overlapCapacity = s_overlapCapacity == 0 ? 64 : s_overlapCapacity * 2;
		s_overlaps = (int*)realloc( s_overlaps, (size_t)s_overlapCapacity * sizeof( int ) );
	}
	s_overlaps[s_overlapCount++] = shape;
	return true;
}

/// Shapes whose fat AABB overlaps the box. Returns the count; slots are in bx_Query_Overlaps.
BX_EXPORT int bx_World_OverlapAABB( int slot, float lx, float ly, float lz, float ux, float uy, float uz, uint32_t categoryLo,
									uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	s_overlapCount = 0;
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3AABB aabb = { { lx, ly, lz }, { ux, uy, uz } };
	b3World_OverlapAABB( worldId, aabb, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ), bxOverlapCallback, NULL );
	return s_overlapCount;
}

/// Shapes that overlap the proxy placed at origin. Returns the count; slots are in bx_Query_Overlaps.
BX_EXPORT int bx_World_OverlapShape( int slot, const float* points, int pointCount, float radius, float ox, float oy, float oz,
									 uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	s_overlapCount = 0;
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) || points == NULL || pointCount < 1 || pointCount > B3_MAX_SHAPE_CAST_POINTS )
	{
		return 0;
	}
	b3ShapeProxy proxy = { (const b3Vec3*)points, pointCount, radius };
	b3Vec3 origin = { ox, oy, oz };
	b3World_OverlapShape( worldId, origin, &proxy, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ), bxOverlapCallback,
						  NULL );
	return s_overlapCount;
}

/// Shapes currently overlapping a sensor shape. Returns the count; slots are in bx_Query_Overlaps.
BX_EXPORT int bx_Shape_GetSensorOverlaps( int slot )
{
	s_overlapCount = 0;
	b3ShapeId shapeId = bxShapeId( slot );
	if ( B3_IS_NULL( shapeId ) )
	{
		return 0;
	}
	int capacity = b3Shape_GetSensorCapacity( shapeId );
	if ( capacity <= 0 )
	{
		return 0;
	}
	b3ShapeId* visitors = (b3ShapeId*)malloc( (size_t)capacity * sizeof( b3ShapeId ) );
	int count = b3Shape_GetSensorData( shapeId, visitors, capacity );
	for ( int i = 0; i < count; ++i )
	{
		bxOverlapCallback( visitors[i], NULL );
	}
	free( visitors );
	return s_overlapCount;
}

// ---------------------------------------------------------------------------
// Body-level queries against one body at its current transform.
// ---------------------------------------------------------------------------

static int bxBodyCastResult( b3BodyCastResult result )
{
	int shape = bxShapeSlotOf( result.shapeId );
	if ( shape == 0 )
	{
		return 0;
	}
	bxScratchVec3( 0, result.point );
	bxScratchVec3( 3, result.normal );
	bx_scratch[6].f = result.fraction;
	bx_scratch[7].i = result.triangleIndex;
	bx_scratch[8].u = (uint32_t)( result.userMaterialId & 0xffffffffu );
	bx_scratch[9].u = (uint32_t)( result.userMaterialId >> 32 );
	return shape;
}

/// Returns the shape slot hit or 0. scratch: [px, py, pz, nx, ny, nz, fraction, triangle (i32), materialLo, materialHi]
BX_EXPORT int bx_Body_CastRay( int slot, float ox, float oy, float oz, float dx, float dy, float dz, float maxFraction,
							   uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3BodyId bodyId = bxBodyId( slot );
	if ( B3_IS_NULL( bodyId ) )
	{
		return 0;
	}
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3BodyCastResult result =
		b3Body_CastRay( bodyId, origin, translation, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ), maxFraction,
						b3Body_GetTransform( bodyId ) );
	return bxBodyCastResult( result );
}

BX_EXPORT int bx_Body_CastShape( int slot, const float* points, int pointCount, float radius, float ox, float oy, float oz,
								 float dx, float dy, float dz, float maxFraction, int canEncroach, uint32_t categoryLo,
								 uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3BodyId bodyId = bxBodyId( slot );
	if ( B3_IS_NULL( bodyId ) || points == NULL || pointCount < 1 || pointCount > B3_MAX_SHAPE_CAST_POINTS )
	{
		return 0;
	}
	b3ShapeProxy proxy = { (const b3Vec3*)points, pointCount, radius };
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3BodyCastResult result =
		b3Body_CastShape( bodyId, origin, &proxy, translation, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ),
						  maxFraction, canEncroach != 0, b3Body_GetTransform( bodyId ) );
	return bxBodyCastResult( result );
}

BX_EXPORT int bx_Body_OverlapShape( int slot, const float* points, int pointCount, float radius, float ox, float oy, float oz,
									uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3BodyId bodyId = bxBodyId( slot );
	if ( B3_IS_NULL( bodyId ) || points == NULL || pointCount < 1 || pointCount > B3_MAX_SHAPE_CAST_POINTS )
	{
		return 0;
	}
	b3ShapeProxy proxy = { (const b3Vec3*)points, pointCount, radius };
	b3Vec3 origin = { ox, oy, oz };
	return b3Body_OverlapShape( bodyId, origin, &proxy, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ),
								b3Body_GetTransform( bodyId ) );
}
