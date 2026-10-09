// Bodies: creation from the def buffer, transforms, velocities, forces, mass, flags.
#include "bx.h"

#include <stdlib.h>

#define BX_BODY( slot )                                                                                                          \
	b3BodyId bodyId = bxBodyId( slot );                                                                                          \
	if ( B3_IS_NULL( bodyId ) )                                                                                                  \
	{                                                                                                                            \
		return;                                                                                                                  \
	}

#define BX_BODY_RET( slot, value )                                                                                               \
	b3BodyId bodyId = bxBodyId( slot );                                                                                          \
	if ( B3_IS_NULL( bodyId ) )                                                                                                  \
	{                                                                                                                            \
		return value;                                                                                                            \
	}

static b3Vec3 bxVec3( float x, float y, float z )
{
	b3Vec3 v = { x, y, z };
	return v;
}

static b3Quat bxQuat( float x, float y, float z, float w )
{
	b3Quat q = { { x, y, z }, w };
	return b3IsNormalizedQuat( q ) ? q : b3NormalizeQuat( q );
}

/// Writes b3DefaultBodyDef into the def buffer.
BX_EXPORT void bx_BodyDef_Default( void )
{
	b3BodyDef def = b3DefaultBodyDef();
	bx_def[BX_BD_TYPE].u = (uint32_t)def.type;
	bxDefSetVec3( BX_BD_POSITION, def.position );
	bxDefSetQuat( BX_BD_ROTATION, def.rotation );
	bxDefSetVec3( BX_BD_LINEAR_VELOCITY, def.linearVelocity );
	bxDefSetVec3( BX_BD_ANGULAR_VELOCITY, def.angularVelocity );
	bx_def[BX_BD_LINEAR_DAMPING].f = def.linearDamping;
	bx_def[BX_BD_ANGULAR_DAMPING].f = def.angularDamping;
	bx_def[BX_BD_GRAVITY_SCALE].f = def.gravityScale;
	bx_def[BX_BD_SLEEP_THRESHOLD].f = def.sleepThreshold;
	bx_def[BX_BD_SAFETY_FACTOR].f = def.safetyFactor;
	bx_def[BX_BD_FLAGS].u = 0;
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_ENABLE_SLEEP, def.enableSleep );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_IS_AWAKE, def.isAwake );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_IS_BULLET, def.isBullet );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_IS_ENABLED, def.isEnabled );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_ALLOW_FAST_ROTATION, def.allowFastRotation );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_ENABLE_CONTACT_RECYCLING, def.enableContactRecycling );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_LOCK_LINEAR_X, def.motionLocks.linearX );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_LOCK_LINEAR_Y, def.motionLocks.linearY );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_LOCK_LINEAR_Z, def.motionLocks.linearZ );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_LOCK_ANGULAR_X, def.motionLocks.angularX );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_LOCK_ANGULAR_Y, def.motionLocks.angularY );
	bxDefSetFlag( BX_BD_FLAGS, BX_BD_LOCK_ANGULAR_Z, def.motionLocks.angularZ );
}

/// Creates a body in the world from the def buffer. Returns the body slot, 0 on failure.
BX_EXPORT int bx_CreateBody( int world )
{
	b3WorldId worldId = bxWorldId( world );
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3BodyDef def = b3DefaultBodyDef();
	uint32_t type = bx_def[BX_BD_TYPE].u;
	def.type = type == 2 ? b3_dynamicBody : type == 1 ? b3_kinematicBody : b3_staticBody;
	def.position = bxDefVec3( BX_BD_POSITION );
	def.rotation = bxDefQuat( BX_BD_ROTATION );
	def.linearVelocity = bxDefVec3( BX_BD_LINEAR_VELOCITY );
	def.angularVelocity = bxDefVec3( BX_BD_ANGULAR_VELOCITY );
	def.linearDamping = bx_def[BX_BD_LINEAR_DAMPING].f;
	def.angularDamping = bx_def[BX_BD_ANGULAR_DAMPING].f;
	def.gravityScale = bx_def[BX_BD_GRAVITY_SCALE].f;
	def.sleepThreshold = bx_def[BX_BD_SLEEP_THRESHOLD].f;
	def.safetyFactor = bx_def[BX_BD_SAFETY_FACTOR].f;
	def.enableSleep = bxDefFlag( BX_BD_FLAGS, BX_BD_ENABLE_SLEEP );
	def.isAwake = bxDefFlag( BX_BD_FLAGS, BX_BD_IS_AWAKE );
	def.isBullet = bxDefFlag( BX_BD_FLAGS, BX_BD_IS_BULLET );
	def.isEnabled = bxDefFlag( BX_BD_FLAGS, BX_BD_IS_ENABLED );
	def.allowFastRotation = bxDefFlag( BX_BD_FLAGS, BX_BD_ALLOW_FAST_ROTATION );
	def.enableContactRecycling = bxDefFlag( BX_BD_FLAGS, BX_BD_ENABLE_CONTACT_RECYCLING );
	def.motionLocks.linearX = bxDefFlag( BX_BD_FLAGS, BX_BD_LOCK_LINEAR_X );
	def.motionLocks.linearY = bxDefFlag( BX_BD_FLAGS, BX_BD_LOCK_LINEAR_Y );
	def.motionLocks.linearZ = bxDefFlag( BX_BD_FLAGS, BX_BD_LOCK_LINEAR_Z );
	def.motionLocks.angularX = bxDefFlag( BX_BD_FLAGS, BX_BD_LOCK_ANGULAR_X );
	def.motionLocks.angularY = bxDefFlag( BX_BD_FLAGS, BX_BD_LOCK_ANGULAR_Y );
	def.motionLocks.angularZ = bxDefFlag( BX_BD_FLAGS, BX_BD_LOCK_ANGULAR_Z );

	int slot = bxTable_Alloc( &bx_bodies );
	def.userData = (void*)(intptr_t)slot;
	b3BodyId id = b3CreateBody( worldId, &def );
	if ( B3_IS_NULL( id ) )
	{
		bxTable_Free( &bx_bodies, slot );
		return 0;
	}
	bxBody* body = bxTable_Get( &bx_bodies, slot );
	body->id = id;
	body->world = world;
	body->alive = 1;
	return slot;
}

/// Destroys the body, its shapes and its joints, and releases their slots.
BX_EXPORT void bx_DestroyBody( int slot )
{
	bxBody* body = bxTable_Get( &bx_bodies, slot );
	if ( body == NULL || body->alive == 0 )
	{
		return;
	}
	// Ask the engine for this body's joints and shapes instead of scanning the
	// global tables (O(1) in the number of other bodies). Each object's userData
	// is its slot.
	if ( b3Body_IsValid( body->id ) )
	{
		int jointCount = b3Body_GetJointCount( body->id );
		if ( jointCount > 0 )
		{
			b3JointId* joints = (b3JointId*)malloc( (size_t)jointCount * sizeof( b3JointId ) );
			int n = b3Body_GetJoints( body->id, joints, jointCount );
			for ( int i = 0; i < n; ++i )
			{
				bxTable_Free( &bx_joints, bxJointSlotOf( joints[i] ) );
			}
			free( joints );
		}
		int shapeCount = b3Body_GetShapeCount( body->id );
		if ( shapeCount > 0 )
		{
			b3ShapeId* shapes = (b3ShapeId*)malloc( (size_t)shapeCount * sizeof( b3ShapeId ) );
			int n = b3Body_GetShapes( body->id, shapes, shapeCount );
			for ( int i = 0; i < n; ++i )
			{
				bxShapeSlotFree( bxShapeSlotOf( shapes[i] ) );
			}
			free( shapes );
		}
	}
	if ( b3Body_IsValid( body->id ) )
	{
		b3DestroyBody( body->id );
	}
	bxTable_Free( &bx_bodies, slot );
}

BX_EXPORT int bx_Body_IsValid( int slot )
{
	b3BodyId bodyId = bxBodyId( slot );
	return B3_IS_NON_NULL( bodyId ) && b3Body_IsValid( bodyId );
}

BX_EXPORT int bx_Body_GetWorld( int slot )
{
	bxBody* body = bxTable_Get( &bx_bodies, slot );
	return body != NULL && body->alive ? body->world : 0;
}

/// 0 static, 1 kinematic, 2 dynamic
BX_EXPORT int bx_Body_GetType( int slot )
{
	BX_BODY_RET( slot, 0 );
	return (int)b3Body_GetType( bodyId );
}

BX_EXPORT void bx_Body_SetType( int slot, int type )
{
	BX_BODY( slot );
	b3Body_SetType( bodyId, type == 2 ? b3_dynamicBody : type == 1 ? b3_kinematicBody : b3_staticBody );
}

/// The engine interns the name, so the string only has to live for this call.
BX_EXPORT void bx_Body_SetName( int slot, const char* name )
{
	BX_BODY( slot );
	b3Body_SetName( bodyId, name );
}

BX_EXPORT const char* bx_Body_GetName( int slot )
{
	BX_BODY_RET( slot, "" );
	const char* name = b3Body_GetName( bodyId );
	return name != NULL ? name : "";
}

/// scratch: [px, py, pz]
BX_EXPORT void bx_Body_GetPosition( int slot )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetPosition( bodyId ) );
}

/// scratch: [qx, qy, qz, qw]
BX_EXPORT void bx_Body_GetRotation( int slot )
{
	BX_BODY( slot );
	bxScratchQuat( 0, b3Body_GetRotation( bodyId ) );
}

/// scratch: [px, py, pz, qx, qy, qz, qw]
BX_EXPORT void bx_Body_GetTransform( int slot )
{
	BX_BODY( slot );
	b3WorldTransform xf = b3Body_GetTransform( bodyId );
	bxScratchVec3( 0, xf.p );
	bxScratchQuat( 3, xf.q );
}

BX_EXPORT void bx_Body_SetTransform( int slot, float px, float py, float pz, float qx, float qy, float qz, float qw )
{
	BX_BODY( slot );
	b3Body_SetTransform( bodyId, bxVec3( px, py, pz ), bxQuat( qx, qy, qz, qw ) );
}

BX_EXPORT void bx_Body_SetTargetTransform( int slot, float px, float py, float pz, float qx, float qy, float qz, float qw,
										   float timeStep, int wake )
{
	BX_BODY( slot );
	b3WorldTransform xf = { bxVec3( px, py, pz ), bxQuat( qx, qy, qz, qw ) };
	b3Body_SetTargetTransform( bodyId, xf, timeStep, wake != 0 );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetLinearVelocity( int slot )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetLinearVelocity( bodyId ) );
}

BX_EXPORT void bx_Body_SetLinearVelocity( int slot, float x, float y, float z )
{
	BX_BODY( slot );
	b3Body_SetLinearVelocity( bodyId, bxVec3( x, y, z ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetAngularVelocity( int slot )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetAngularVelocity( bodyId ) );
}

BX_EXPORT void bx_Body_SetAngularVelocity( int slot, float x, float y, float z )
{
	BX_BODY( slot );
	b3Body_SetAngularVelocity( bodyId, bxVec3( x, y, z ) );
}

BX_EXPORT void bx_Body_ApplyForce( int slot, float fx, float fy, float fz, float px, float py, float pz, int wake )
{
	BX_BODY( slot );
	b3Body_ApplyForce( bodyId, bxVec3( fx, fy, fz ), bxVec3( px, py, pz ), wake != 0 );
}

BX_EXPORT void bx_Body_ApplyForceToCenter( int slot, float fx, float fy, float fz, int wake )
{
	BX_BODY( slot );
	b3Body_ApplyForceToCenter( bodyId, bxVec3( fx, fy, fz ), wake != 0 );
}

BX_EXPORT void bx_Body_ApplyTorque( int slot, float x, float y, float z, int wake )
{
	BX_BODY( slot );
	b3Body_ApplyTorque( bodyId, bxVec3( x, y, z ), wake != 0 );
}

BX_EXPORT void bx_Body_ApplyLinearImpulse( int slot, float ix, float iy, float iz, float px, float py, float pz, int wake )
{
	BX_BODY( slot );
	b3Body_ApplyLinearImpulse( bodyId, bxVec3( ix, iy, iz ), bxVec3( px, py, pz ), wake != 0 );
}

BX_EXPORT void bx_Body_ApplyLinearImpulseToCenter( int slot, float ix, float iy, float iz, int wake )
{
	BX_BODY( slot );
	b3Body_ApplyLinearImpulseToCenter( bodyId, bxVec3( ix, iy, iz ), wake != 0 );
}

BX_EXPORT void bx_Body_ApplyAngularImpulse( int slot, float x, float y, float z, int wake )
{
	BX_BODY( slot );
	b3Body_ApplyAngularImpulse( bodyId, bxVec3( x, y, z ), wake != 0 );
}

BX_EXPORT float bx_Body_GetMass( int slot )
{
	BX_BODY_RET( slot, 0.0f );
	return b3Body_GetMass( bodyId );
}

BX_EXPORT void bx_Body_ApplyMassFromShapes( int slot )
{
	BX_BODY( slot );
	b3Body_ApplyMassFromShapes( bodyId );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetLocalCenterOfMass( int slot )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetLocalCenter( bodyId ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetWorldCenterOfMass( int slot )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetWorldCenter( bodyId ) );
}

/// scratch: [mass, cx, cy, cz, then the inertia tensor column major: cx.x cx.y cx.z, cy.x cy.y cy.z, cz.x cz.y cz.z]
BX_EXPORT void bx_Body_GetMassData( int slot )
{
	BX_BODY( slot );
	b3MassData md = b3Body_GetMassData( bodyId );
	bx_scratch[0].f = md.mass;
	bxScratchVec3( 1, md.center );
	bxScratchMat3( 4, md.inertia );
}

/// Reads the same 13-float layout from the def buffer.
BX_EXPORT void bx_Body_SetMassData( int slot )
{
	BX_BODY( slot );
	b3MassData md;
	md.mass = bx_def[0].f;
	md.center = bxDefVec3( 1 );
	md.inertia.cx = bxDefVec3( 4 );
	md.inertia.cy = bxDefVec3( 7 );
	md.inertia.cz = bxDefVec3( 10 );
	b3Body_SetMassData( bodyId, md );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetLocalPoint( int slot, float wx, float wy, float wz )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetLocalPoint( bodyId, bxVec3( wx, wy, wz ) ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetWorldPoint( int slot, float lx, float ly, float lz )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetWorldPoint( bodyId, bxVec3( lx, ly, lz ) ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetLocalVector( int slot, float wx, float wy, float wz )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetLocalVector( bodyId, bxVec3( wx, wy, wz ) ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Body_GetWorldVector( int slot, float lx, float ly, float lz )
{
	BX_BODY( slot );
	bxScratchVec3( 0, b3Body_GetWorldVector( bodyId, bxVec3( lx, ly, lz ) ) );
}

BX_EXPORT float bx_Body_GetLinearDamping( int slot )
{
	BX_BODY_RET( slot, 0.0f );
	return b3Body_GetLinearDamping( bodyId );
}

BX_EXPORT void bx_Body_SetLinearDamping( int slot, float damping )
{
	BX_BODY( slot );
	b3Body_SetLinearDamping( bodyId, damping );
}

BX_EXPORT float bx_Body_GetAngularDamping( int slot )
{
	BX_BODY_RET( slot, 0.0f );
	return b3Body_GetAngularDamping( bodyId );
}

BX_EXPORT void bx_Body_SetAngularDamping( int slot, float damping )
{
	BX_BODY( slot );
	b3Body_SetAngularDamping( bodyId, damping );
}

BX_EXPORT float bx_Body_GetGravityScale( int slot )
{
	BX_BODY_RET( slot, 0.0f );
	return b3Body_GetGravityScale( bodyId );
}

BX_EXPORT void bx_Body_SetGravityScale( int slot, float scale )
{
	BX_BODY( slot );
	b3Body_SetGravityScale( bodyId, scale );
}

BX_EXPORT int bx_Body_IsAwake( int slot )
{
	BX_BODY_RET( slot, 0 );
	return b3Body_IsAwake( bodyId );
}

BX_EXPORT void bx_Body_SetAwake( int slot, int awake )
{
	BX_BODY( slot );
	b3Body_SetAwake( bodyId, awake != 0 );
}

BX_EXPORT void bx_Body_EnableSleep( int slot, int flag )
{
	BX_BODY( slot );
	b3Body_EnableSleep( bodyId, flag != 0 );
}

BX_EXPORT int bx_Body_IsSleepEnabled( int slot )
{
	BX_BODY_RET( slot, 0 );
	return b3Body_IsSleepEnabled( bodyId );
}

BX_EXPORT void bx_Body_SetSleepThreshold( int slot, float threshold )
{
	BX_BODY( slot );
	b3Body_SetSleepThreshold( bodyId, threshold );
}

BX_EXPORT float bx_Body_GetSleepThreshold( int slot )
{
	BX_BODY_RET( slot, 0.0f );
	return b3Body_GetSleepThreshold( bodyId );
}

BX_EXPORT int bx_Body_IsEnabled( int slot )
{
	BX_BODY_RET( slot, 0 );
	return b3Body_IsEnabled( bodyId );
}

BX_EXPORT void bx_Body_SetEnabled( int slot, int flag )
{
	BX_BODY( slot );
	if ( flag )
	{
		b3Body_Enable( bodyId );
	}
	else
	{
		b3Body_Disable( bodyId );
	}
}

BX_EXPORT int bx_Body_IsBullet( int slot )
{
	BX_BODY_RET( slot, 0 );
	return b3Body_IsBullet( bodyId );
}

BX_EXPORT void bx_Body_SetBullet( int slot, int flag )
{
	BX_BODY( slot );
	b3Body_SetBullet( bodyId, flag != 0 );
}

BX_EXPORT void bx_Body_AllowFastRotation( int slot, int flag )
{
	BX_BODY( slot );
	b3Body_AllowFastRotation( bodyId, flag != 0 );
}

BX_EXPORT int bx_Body_IsFastRotationAllowed( int slot )
{
	BX_BODY_RET( slot, 0 );
	return b3Body_IsFastRotationAllowed( bodyId );
}

BX_EXPORT void bx_Body_SetMotionLocks( int slot, int lx, int ly, int lz, int ax, int ay, int az )
{
	BX_BODY( slot );
	b3MotionLocks locks = { lx != 0, ly != 0, lz != 0, ax != 0, ay != 0, az != 0 };
	b3Body_SetMotionLocks( bodyId, locks );
}

/// scratch (i32): [lx, ly, lz, ax, ay, az]
BX_EXPORT void bx_Body_GetMotionLocks( int slot )
{
	BX_BODY( slot );
	b3MotionLocks locks = b3Body_GetMotionLocks( bodyId );
	bx_scratch[0].i = locks.linearX;
	bx_scratch[1].i = locks.linearY;
	bx_scratch[2].i = locks.linearZ;
	bx_scratch[3].i = locks.angularX;
	bx_scratch[4].i = locks.angularY;
	bx_scratch[5].i = locks.angularZ;
}

BX_EXPORT int bx_Body_GetShapeCount( int slot )
{
	BX_BODY_RET( slot, 0 );
	return b3Body_GetShapeCount( bodyId );
}

/// scratch: [lx, ly, lz, ux, uy, uz]
BX_EXPORT void bx_Body_ComputeAABB( int slot )
{
	BX_BODY( slot );
	b3AABB aabb = b3Body_ComputeAABB( bodyId );
	bxScratchVec3( 0, aabb.lowerBound );
	bxScratchVec3( 3, aabb.upperBound );
}

/// Bulk transform read. out holds 7 floats per slot: position xyz, rotation xyzw.
/// A slot that is not a live body leaves its record untouched. Returns the number of records written.
BX_EXPORT int bx_Bodies_GetTransforms( const int* slots, int count, float* out )
{
	int written = 0;
	for ( int i = 0; i < count; ++i )
	{
		bxBody* body = bxTable_Get( &bx_bodies, slots[i] );
		if ( body == NULL || body->alive == 0 )
		{
			continue;
		}
		b3WorldTransform xf = b3Body_GetTransform( body->id );
		float* record = out + 7 * i;
		record[0] = xf.p.x;
		record[1] = xf.p.y;
		record[2] = xf.p.z;
		record[3] = xf.q.v.x;
		record[4] = xf.q.v.y;
		record[5] = xf.q.v.z;
		record[6] = xf.q.s;
		written += 1;
	}
	return written;
}

/// Bulk teleport. Same record layout as bx_Bodies_GetTransforms. Dead slots are skipped.
BX_EXPORT int bx_Bodies_SetTransforms( const int* slots, int count, const float* in )
{
	int written = 0;
	for ( int i = 0; i < count; ++i )
	{
		bxBody* body = bxTable_Get( &bx_bodies, slots[i] );
		if ( body == NULL || body->alive == 0 )
		{
			continue;
		}
		const float* r = in + 7 * i;
		b3Body_SetTransform( body->id, bxVec3( r[0], r[1], r[2] ), bxQuat( r[3], r[4], r[5], r[6] ) );
		written += 1;
	}
	return written;
}
