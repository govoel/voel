package app.voel.paging.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class PagingSessionTest {
    @Test
    fun evictsAndReloadsInBothDirections() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var snapshot = PageSnapshot(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
        val offsets = mutableListOf<Int>()
        var largestWindow = 0
        lateinit var session: PagingSession
        session = PagingSession(10, 30, 2, onRequest = { request ->
            offsets.add(request.offset)
            session.resolve(request.id, (request.offset until minOf(request.offset + request.limit, 1000))
                .map { PageItem("item-$it", it) }, 1000)
        }, onCancel = {}, onSnapshot = {
            snapshot = it
            largestWindow = maxOf(largestWindow, it.items.size)
        })
        try {
            session.start()
            session.start()
            runCurrent()
            assertEquals(listOf(0), offsets)
            repeat(70) {
                session.access(snapshot.items.last().id)
                runCurrent()
                assertTrue(snapshot.items.size <= 30)
            }
            assertTrue(offsets.last() >= 700)
            assertFalse(snapshot.items.any { it.id == "item-0" })
            // Insert/drop can be presented in separate events; even that transient is bounded.
            assertTrue(largestWindow <= 40)
            repeat(75) {
                session.access(snapshot.items.first().id)
                runCurrent()
            }
            assertEquals("item-0", snapshot.items.first().id)
            assertEquals(2, offsets.count { it == 0 })
            assertTrue(snapshot.items.size <= 30)
        } finally {
            session.close()
            runCurrent()
            Dispatchers.resetMain()
        }
    }

    @Test
    fun retriesWithoutLosingRowsAndIgnoresDuplicateReplies() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var snapshot = PageSnapshot(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
        val requests = mutableListOf<PageRequest>()
        val session = PagingSession(10, 30, 2, requests::add, {}, { snapshot = it })
        try {
            session.start()
            runCurrent()
            session.resolve(requests.last().id, (0 until 10).map { PageItem("$it", it) }, 12)
            runCurrent()
            repeat(10) { session.access("9") }
            runCurrent()
            assertEquals(2, requests.size)
            session.reject(requests.last().id)
            runCurrent()
            assertEquals(PageStatus.FAILED, snapshot.append)
            assertEquals(10, snapshot.items.size)
            session.retry()
            runCurrent()
            assertEquals(3, requests.size)
            session.resolve(requests.last().id, listOf(PageItem("10", 10), PageItem("11", 11)), 12)
            session.resolve(requests.last().id, listOf(PageItem("duplicate", 0)), 12)
            runCurrent()
            assertEquals(12, snapshot.items.size)
            assertEquals(PageStatus.COMPLETE, snapshot.append)
        } finally {
            session.close()
            runCurrent()
            Dispatchers.resetMain()
        }
    }

    @Test
    fun closingCancelsPendingRequestsAndDiscardsLateResults() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val requests = mutableListOf<PageRequest>()
        val canceled = mutableListOf<Int>()
        var snapshot = PageSnapshot(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
        val session = PagingSession(10, 30, 2, requests::add, canceled::add, { snapshot = it })
        session.start()
        runCurrent()
        session.close()
        session.close()
        runCurrent()
        session.resolve(requests.single().id, listOf(PageItem("late", 0)), 1)
        session.start()
        runCurrent()
        assertEquals(listOf(requests.single().id), canceled)
        assertTrue(snapshot.items.isEmpty())
        assertEquals(1, requests.size)
        Dispatchers.resetMain()
    }

    @Test
    fun refreshCancelsTheOldGenerationAndKeepsTheAnchorPage() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val requests = mutableListOf<PageRequest>()
        val canceled = mutableListOf<Int>()
        var snapshot = PageSnapshot(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
        val session = PagingSession(10, 30, 2, requests::add, canceled::add, { snapshot = it })
        try {
            session.start()
            runCurrent()
            session.resolve(requests.last().id, (0 until 10).map { PageItem("$it", it) }, 100)
            runCurrent()
            session.access("9")
            runCurrent()
            session.resolve(requests.last().id, (10 until 20).map { PageItem("$it", it) }, 100)
            runCurrent()
            session.access("19")
            runCurrent()
            val oldRequest = requests.last()
            session.refresh()
            runCurrent()
            assertTrue(oldRequest.id in canceled)
            val refreshed = requests.last()
            assertEquals(10, refreshed.offset)
            session.resolve(oldRequest.id, listOf(PageItem("stale", 0)), 100)
            session.resolve(refreshed.id, (10 until 20).map { PageItem("new-$it", it) }, 100)
            runCurrent()
            assertFalse(snapshot.items.any { it.id == "stale" })
            assertTrue(snapshot.items.all { it.id.startsWith("new-") })
        } finally {
            session.close()
            runCurrent()
            Dispatchers.resetMain()
        }
    }

    @Test
    fun anEmptyDatasetIsSuccessfulAndTerminal() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val requests = mutableListOf<PageRequest>()
        var snapshot = PageSnapshot(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
        val session = PagingSession(10, 30, 2, requests::add, {}, { snapshot = it })
        session.start()
        runCurrent()
        session.resolve(requests.single().id, emptyList(), 0)
        runCurrent()
        assertEquals(PageStatus.READY, snapshot.refresh)
        assertEquals(PageStatus.COMPLETE, snapshot.append)
        assertEquals(PageStatus.COMPLETE, snapshot.prepend)
        session.close()
        runCurrent()
        Dispatchers.resetMain()
    }
}
