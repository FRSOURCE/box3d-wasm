// The deluxe build's task system.
//
// Box3D can create its own threads, but its scheduler creates them with each
// world and joins them in b3DestroyWorld. In a browser the joined workers only
// return to emscripten's pool through a message the main thread has not
// processed yet, so destroying a world and creating the next one in the same
// tick asks pthread_create for a worker that cannot start while the main
// thread is busy, and the page hangs. The shim therefore owns the threads: a
// task ring, a semaphore, workers created once (detached, never joined) and
// shared by every world. Box3D still splits the work by workerCount, so the
// results are the same as with its own scheduler.
#include "bx.h"

#ifdef __EMSCRIPTEN_PTHREADS__

#include <pthread.h>
#include <sched.h>
#include <semaphore.h>
#include <stdatomic.h>

// Emscripten pre-spawns PTHREAD_POOL_SIZE workers when the module loads. The
// frontend reads the real count and reports it through bx_SetWorkerPool so
// pthread_create never has to start a worker on the spot.
#ifndef BX_WORKER_POOL
#define BX_WORKER_POOL 8
#endif

// Tasks live for one step and the ring is rewound at the top of every step.
// Box3D's own scheduler holds 256 with 32 workers.
#define BX_TASK_CAPACITY 512

enum bxTaskStatus
{
	bxTaskFree = 0,
	bxTaskPending = 1,
	bxTaskClaimed = 2,
	bxTaskComplete = 3,
};

typedef struct bxTask
{
	b3TaskCallback* callback;
	void* context;
	atomic_int status;
} bxTask;

static bxTask s_tasks[BX_TASK_CAPACITY];
static atomic_int s_taskCount;
static sem_t s_taskSemaphore;
static int s_workerPool = BX_WORKER_POOL;
static int s_workerThreads;
static int s_poolStarted;

static int bxRunOneTask( void )
{
	int count = atomic_load( &s_taskCount );
	if ( count > BX_TASK_CAPACITY )
	{
		count = BX_TASK_CAPACITY;
	}
	for ( int i = 0; i < count; ++i )
	{
		bxTask* task = s_tasks + i;
		if ( atomic_load( &task->status ) != bxTaskPending )
		{
			continue;
		}
		int expected = bxTaskPending;
		if ( atomic_compare_exchange_strong( &task->status, &expected, bxTaskClaimed ) == 0 )
		{
			continue;
		}
		task->callback( task->context );
		atomic_store( &task->status, bxTaskComplete );
		return 1;
	}
	return 0;
}

static void* bxWorkerMain( void* context )
{
	(void)context;
	for ( ;; )
	{
		sem_wait( &s_taskSemaphore );
		while ( bxRunOneTask() )
		{
		}
	}
	return NULL;
}

// Grows the shared pool up to the requested thread count. Called while
// creating a world, never during a step. Returns the threads this world may use.
static int bxEnsureWorkers( int threads )
{
	if ( threads > s_workerPool )
	{
		threads = s_workerPool;
	}
	if ( s_poolStarted == 0 )
	{
		if ( sem_init( &s_taskSemaphore, 0, 0 ) != 0 )
		{
			return 0;
		}
		s_poolStarted = 1;
	}
	while ( s_workerThreads < threads )
	{
		pthread_t thread;
		if ( pthread_create( &thread, NULL, bxWorkerMain, NULL ) != 0 )
		{
			break;
		}
		pthread_detach( thread );
		s_workerThreads++;
	}
	return s_workerThreads < threads ? s_workerThreads : threads;
}

static atomic_int s_inline;

void bxThreads_SetInline( int on )
{
	atomic_store( &s_inline, on );
}

static void* bxEnqueueTask( b3TaskCallback* task, void* taskContext, void* userContext, const char* name )
{
	(void)userContext;
	(void)name;
	if ( atomic_load( &s_inline ) != 0 )
	{
		// a JS callback may fire inside this task: keep it on the stepping thread
		task( taskContext );
		return NULL;
	}
	int slot = atomic_fetch_add( &s_taskCount, 1 );
	if ( slot >= BX_TASK_CAPACITY )
	{
		// more tasks in one step than the ring holds: run it here, nothing to wait for
		task( taskContext );
		return NULL;
	}
	bxTask* entry = s_tasks + slot;
	entry->callback = task;
	entry->context = taskContext;
	atomic_store( &entry->status, bxTaskPending );
	sem_post( &s_taskSemaphore );
	return entry;
}

static void bxFinishTask( void* userTask, void* userContext )
{
	(void)userContext;
	if ( userTask == NULL )
	{
		return;
	}
	bxTask* entry = userTask;
	while ( atomic_load( &entry->status ) != bxTaskComplete )
	{
		// carry a share of the step instead of spinning
		if ( bxRunOneTask() == 0 )
		{
			sched_yield();
		}
	}
}

static int bxMaxWorkers( void )
{
	int max = s_workerPool + 1;
	return max < B3_MAX_WORKERS ? max : B3_MAX_WORKERS;
}

void bxThreads_FillWorldDef( b3WorldDef* def, int workerCount )
{
	def->workerCount = 1;
	if ( workerCount <= 1 )
	{
		return;
	}
	if ( workerCount > bxMaxWorkers() )
	{
		workerCount = bxMaxWorkers();
	}
	int threads = bxEnsureWorkers( workerCount - 1 );
	if ( threads <= 0 )
	{
		return;
	}
	def->workerCount = (uint32_t)( threads + 1 );
	def->enqueueTask = bxEnqueueTask;
	def->finishTask = bxFinishTask;
	def->userTaskContext = NULL;
}

void bxThreads_BeginStep( void )
{
	// every task from the last step completed, because finishTask waited for each one
	atomic_store( &s_taskCount, 0 );
}

BX_EXPORT int bx_GetMaxWorkers( void )
{
	return bxMaxWorkers();
}

/// Tells the shim how many workers emscripten actually pre-spawned, so the
/// clamp matches the pool. Call once after the module loads, before any world.
BX_EXPORT void bx_SetWorkerPool( int workers )
{
	if ( s_workerThreads > 0 )
	{
		return;
	}
	s_workerPool = workers < 0 ? 0 : workers;
}

#else

void bxThreads_SetInline( int on )
{
	(void)on;
}

void bxThreads_FillWorldDef( b3WorldDef* def, int workerCount )
{
	(void)workerCount;
	def->workerCount = 1;
}

void bxThreads_BeginStep( void )
{
}

BX_EXPORT int bx_GetMaxWorkers( void )
{
	return 1;
}

BX_EXPORT void bx_SetWorkerPool( int workers )
{
	(void)workers;
}

#endif
