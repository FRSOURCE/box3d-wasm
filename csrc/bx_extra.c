// Scalar getters and setters that round out the world, body, shape and joint
// surface, plus engine-wide settings.
#include "bx.h"

#include <string.h>

#define BX_X_WORLD( slot )                                                                                                       \
	b3WorldId worldId = bxWorldId( slot );                                                                                       \
	if ( B3_IS_NULL( worldId ) )                                                                                                 \
	{                                                                                                                            \
		return;                                                                                                                  \
	}

#define BX_X_BODY( slot, value )                                                                                                 \
	b3BodyId bodyId = bxBodyId( slot );                                                                                          \
	if ( B3_IS_NULL( bodyId ) )                                                                                                  \
	{                                                                                                                            \
		return value;                                                                                                            \
	}

#define BX_X_SHAPE( slot, value )                                                                                                \
	b3ShapeId shapeId = bxShapeId( slot );                                                                                       \
	if ( B3_IS_NULL( shapeId ) )                                                                                                 \
	{                                                                                                                            \
		return value;                                                                                                            \
	}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

BX_EXPORT void bx_World_EnableWarmStarting( int slot, int flag )
{
	BX_X_WORLD( slot );
	b3World_EnableWarmStarting( worldId, flag != 0 );
}

BX_EXPORT int bx_World_IsWarmStartingEnabled( int slot )
{
	b3WorldId worldId = bxWorldId( slot );
	return B3_IS_NON_NULL( worldId ) && b3World_IsWarmStartingEnabled( worldId );
}

BX_EXPORT void bx_World_EnableSpeculative( int slot, int flag )
{
	BX_X_WORLD( slot );
	b3World_EnableSpeculative( worldId, flag != 0 );
}

BX_EXPORT void bx_World_EnableRestitutionPropagation( int slot, int flag )
{
	BX_X_WORLD( slot );
	b3World_EnableRestitutionPropagation( worldId, flag != 0 );
}

BX_EXPORT int bx_World_IsRestitutionPropagationEnabled( int slot )
{
	b3WorldId worldId = bxWorldId( slot );
	return B3_IS_NON_NULL( worldId ) && b3World_IsRestitutionPropagationEnabled( worldId );
}

BX_EXPORT void bx_World_SetRestitutionIterations( int slot, int iterations )
{
	BX_X_WORLD( slot );
	b3World_SetRestitutionIterations( worldId, iterations );
}

BX_EXPORT int bx_World_GetRestitutionIterations( int slot )
{
	b3WorldId worldId = bxWorldId( slot );
	return B3_IS_NULL( worldId ) ? 0 : b3World_GetRestitutionIterations( worldId );
}

BX_EXPORT void bx_World_SetContactRecycleDistance( int slot, float distance )
{
	BX_X_WORLD( slot );
	b3World_SetContactRecycleDistance( worldId, distance );
}

BX_EXPORT float bx_World_GetContactRecycleDistance( int slot )
{
	b3WorldId worldId = bxWorldId( slot );
	return B3_IS_NULL( worldId ) ? 0.0f : b3World_GetContactRecycleDistance( worldId );
}

/// scratch: [lx, ly, lz, ux, uy, uz]
BX_EXPORT void bx_World_GetBounds( int slot )
{
	BX_X_WORLD( slot );
	b3AABB aabb = b3World_GetBounds( worldId );
	bxScratchVec3( 0, aabb.lowerBound );
	bxScratchVec3( 3, aabb.upperBound );
}

/// scratch (i32): [staticShapes, dynamicShapes, staticBodies, dynamicBodies, contacts]
BX_EXPORT void bx_World_GetMaxCapacity( int slot )
{
	BX_X_WORLD( slot );
	b3Capacity c = b3World_GetMaxCapacity( worldId );
	bx_scratch[0].i = c.staticShapeCount;
	bx_scratch[1].i = c.dynamicShapeCount;
	bx_scratch[2].i = c.staticBodyCount;
	bx_scratch[3].i = c.dynamicBodyCount;
	bx_scratch[4].i = c.contactCount;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

BX_EXPORT float bx_Body_GetInverseMass( int slot )
{
	BX_X_BODY( slot, 0.0f );
	return b3Body_GetInverseMass( bodyId );
}

/// scratch: inertia column major x9
BX_EXPORT void bx_Body_GetLocalRotationalInertia( int slot )
{
	BX_X_BODY( slot, );
	bxScratchMat3( 0, b3Body_GetLocalRotationalInertia( bodyId ) );
}

BX_EXPORT void bx_Body_GetWorldInverseRotationalInertia( int slot )
{
	BX_X_BODY( slot, );
	bxScratchMat3( 0, b3Body_GetWorldInverseRotationalInertia( bodyId ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetMaxExtent( int slot )
{
	BX_X_BODY( slot, );
	bxScratchVec3( 0, b3Body_GetMaxExtent( bodyId ) );
}

BX_EXPORT float bx_Body_GetMinExtent( int slot )
{
	BX_X_BODY( slot, 0.0f );
	return b3Body_GetMinExtent( bodyId );
}

BX_EXPORT void bx_Body_GetMaxExtentOrigin( int slot )
{
	BX_X_BODY( slot, );
	bxScratchVec3( 0, b3Body_GetMaxExtentOrigin( bodyId ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetWorldPointVelocity( int slot, float x, float y, float z )
{
	BX_X_BODY( slot, );
	b3Vec3 p = { x, y, z };
	bxScratchVec3( 0, b3Body_GetWorldPointVelocity( bodyId, p ) );
}

BX_EXPORT void bx_Body_GetLocalPointVelocity( int slot, float x, float y, float z )
{
	BX_X_BODY( slot, );
	b3Vec3 p = { x, y, z };
	bxScratchVec3( 0, b3Body_GetLocalPointVelocity( bodyId, p ) );
}

BX_EXPORT float bx_Body_GetSafetyFactor( int slot )
{
	BX_X_BODY( slot, 0.0f );
	return b3Body_GetSafetyFactor( bodyId );
}

BX_EXPORT void bx_Body_SetSafetyFactor( int slot, float factor )
{
	BX_X_BODY( slot, );
	b3Body_SetSafetyFactor( bodyId, factor );
}

BX_EXPORT void bx_Body_EnableContactRecycling( int slot, int flag )
{
	BX_X_BODY( slot, );
	b3Body_EnableContactRecycling( bodyId, flag != 0 );
}

BX_EXPORT int bx_Body_IsContactRecyclingEnabled( int slot )
{
	BX_X_BODY( slot, 0 );
	return b3Body_IsContactRecyclingEnabled( bodyId );
}

BX_EXPORT void bx_Body_EnableHitEvents( int slot, int flag )
{
	BX_X_BODY( slot, );
	b3Body_EnableHitEvents( bodyId, flag != 0 );
}

/// Returns the distance to the body's closest point; scratch: [x, y, z] of that point
BX_EXPORT float bx_Body_GetClosestPoint( int slot, float x, float y, float z )
{
	BX_X_BODY( slot, 0.0f );
	b3Vec3 result = { 0 };
	b3Vec3 target = { x, y, z };
	float distance = b3Body_GetClosestPoint( bodyId, &result, target );
	bxScratchVec3( 0, result );
	return distance;
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/// scratch: [cx, cy, cz, radius]
BX_EXPORT void bx_Shape_GetSphere( int slot )
{
	BX_X_SHAPE( slot, );
	b3Sphere s = b3Shape_GetSphere( shapeId );
	bxScratchVec3( 0, s.center );
	bx_scratch[3].f = s.radius;
}

BX_EXPORT void bx_Shape_SetSphere( int slot, float cx, float cy, float cz, float radius )
{
	BX_X_SHAPE( slot, );
	b3Sphere s = { { cx, cy, cz }, radius };
	b3Shape_SetSphere( shapeId, &s );
}

/// scratch: [ax, ay, az, bx, by, bz, radius]
BX_EXPORT void bx_Shape_GetCapsule( int slot )
{
	BX_X_SHAPE( slot, );
	b3Capsule c = b3Shape_GetCapsule( shapeId );
	bxScratchVec3( 0, c.center1 );
	bxScratchVec3( 3, c.center2 );
	bx_scratch[6].f = c.radius;
}

BX_EXPORT void bx_Shape_SetCapsule( int slot, float ax, float ay, float az, float bx, float by, float bz, float radius )
{
	BX_X_SHAPE( slot, );
	b3Capsule c = { { ax, ay, az }, { bx, by, bz }, radius };
	b3Shape_SetCapsule( shapeId, &c );
}

/// Returns the distance to the target; scratch: [x, y, z] of the closest point on the shape
BX_EXPORT void bx_Shape_GetClosestPoint( int slot, float x, float y, float z )
{
	BX_X_SHAPE( slot, );
	b3Vec3 target = { x, y, z };
	bxScratchVec3( 0, b3Shape_GetClosestPoint( shapeId, target ) );
}

BX_EXPORT void bx_Shape_EnablePreSolveEvents( int slot, int flag )
{
	BX_X_SHAPE( slot, );
	b3Shape_EnablePreSolveEvents( shapeId, flag != 0 );
}

BX_EXPORT int bx_Shape_ArePreSolveEventsEnabled( int slot )
{
	BX_X_SHAPE( slot, 0 );
	return b3Shape_ArePreSolveEventsEnabled( shapeId );
}

BX_EXPORT void bx_Shape_ApplyWind( int slot, float wx, float wy, float wz, float drag, float lift, float maxSpeed, int wake )
{
	BX_X_SHAPE( slot, );
	b3Vec3 wind = { wx, wy, wz };
	b3Shape_ApplyWind( shapeId, wind, drag, lift, maxSpeed, wake != 0 );
}

/// Writes the name (UTF-8, NUL terminated) into wasm memory at out, up to capacity bytes. Returns the full byte length.
BX_EXPORT int bx_Shape_GetName( int slot, char* out, int capacity )
{
	BX_X_SHAPE( slot, 0 );
	const char* name = b3Shape_GetName( shapeId );
	if ( name == NULL )
	{
		name = "";
	}
	int length = (int)strlen( name );
	if ( out != NULL && capacity > 0 )
	{
		int n = length < capacity - 1 ? length : capacity - 1;
		memcpy( out, name, (size_t)n );
		out[n] = 0;
	}
	return length;
}

BX_EXPORT void bx_Shape_SetName( int slot, const char* name )
{
	BX_X_SHAPE( slot, );
	b3Shape_SetName( shapeId, name );
}

// ---------------------------------------------------------------------------
// Joint
// ---------------------------------------------------------------------------

BX_EXPORT int bx_Joint_IsAwake( int slot )
{
	b3JointId jointId = bxJointId( slot );
	return B3_IS_NON_NULL( jointId ) && b3Joint_IsAwake( jointId );
}

/// scratch: [lower, upper]
BX_EXPORT void bx_DistanceJoint_GetSpringForceRange( int slot )
{
	b3JointId jointId = bxJointId( slot );
	if ( B3_IS_NULL( jointId ) )
	{
		return;
	}
	float lower = 0.0f;
	float upper = 0.0f;
	b3DistanceJoint_GetSpringForceRange( jointId, &lower, &upper );
	bx_scratch[0].f = lower;
	bx_scratch[1].f = upper;
}

// ---------------------------------------------------------------------------
// Engine-wide settings
// ---------------------------------------------------------------------------

BX_EXPORT void bx_SetLengthUnitsPerMeter( float lengthUnits )
{
	b3SetLengthUnitsPerMeter( lengthUnits );
}

BX_EXPORT float bx_GetLengthUnitsPerMeter( void )
{
	return b3GetLengthUnitsPerMeter();
}

BX_EXPORT void bx_SetStallThreshold( float seconds )
{
	b3SetStallThreshold( seconds );
}

BX_EXPORT float bx_GetStallThreshold( void )
{
	return b3GetStallThreshold();
}

BX_EXPORT int bx_GetMaxManifoldPoints( void )
{
	return b3GetMaxManifoldPoints();
}

BX_EXPORT int bx_IsDoublePrecision( void )
{
	return b3IsDoublePrecision();
}

BX_EXPORT int bx_GetWorldCount( void )
{
	return b3GetWorldCount();
}

// ---------------------------------------------------------------------------
// Mesh materials and shape geometry setters
// ---------------------------------------------------------------------------

static void bxScratchMaterial( b3SurfaceMaterial m )
{
	bx_scratch[0].f = m.friction;
	bx_scratch[1].f = m.restitution;
	bx_scratch[2].f = m.rollingResistance;
	bxScratchVec3( 3, m.tangentVelocity );
	bx_scratch[6].u = (uint32_t)( m.userMaterialId & 0xffffffffu );
	bx_scratch[7].u = (uint32_t)( m.userMaterialId >> 32 );
	bx_scratch[8].u = m.customColor;
}

BX_EXPORT int bx_Shape_GetMeshMaterialCount( int slot )
{
	BX_X_SHAPE( slot, 0 );
	return b3Shape_GetMeshMaterialCount( shapeId );
}

/// scratch: [friction, restitution, rolling, tx, ty, tz, userMaterialLo, userMaterialHi, color]
BX_EXPORT void bx_Shape_GetMeshSurfaceMaterial( int slot, int index )
{
	BX_X_SHAPE( slot, );
	bxScratchMaterial( b3Shape_GetMeshSurfaceMaterial( shapeId, index ) );
}

BX_EXPORT void bx_Shape_SetMeshMaterial( int slot, int index, float friction, float restitution, float rolling, float tx,
										 float ty, float tz, uint32_t userMaterialLo, uint32_t userMaterialHi, uint32_t color )
{
	BX_X_SHAPE( slot, );
	b3SurfaceMaterial m = b3DefaultSurfaceMaterial();
	m.friction = friction;
	m.restitution = restitution;
	m.rollingResistance = rolling;
	m.tangentVelocity = ( b3Vec3 ){ tx, ty, tz };
	m.userMaterialId = (uint64_t)userMaterialLo | ( (uint64_t)userMaterialHi << 32 );
	m.customColor = color;
	b3Shape_SetMeshMaterial( shapeId, m, index );
}

/// Replaces a hull shape's hull (cloned by the world). Does not change the body's mass.
BX_EXPORT void bx_Shape_SetHull( int slot, int resourceSlot )
{
	BX_X_SHAPE( slot, );
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	if ( resource == NULL || resource->alive == 0 || resource->kind != BX_RESOURCE_HULL )
	{
		return;
	}
	b3Shape_SetHull( shapeId, (const b3HullData*)resource->ptr );
}
