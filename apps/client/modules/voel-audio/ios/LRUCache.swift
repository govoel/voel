private class DoublyLinkedListNode<Key, Value> {
    var key: Key
    var value: Value
    var next: DoublyLinkedListNode?
    var prev: DoublyLinkedListNode?

    init(key: Key, value: Value) {
        self.key = key
        self.value = value
    }
}

private class DoublyLinkedList<Key, Value> {
    private var head: DoublyLinkedListNode<Key, Value>?
    private var tail: DoublyLinkedListNode<Key, Value>?

    func addNodeToHead(_ node: DoublyLinkedListNode<Key, Value>) {
        node.next = head?.next
        node.prev = head
        head?.next?.prev = node
        head?.next = node
    }

    func removeNode(_ node: DoublyLinkedListNode<Key, Value>) {
        node.prev?.next = node.next
        node.next?.prev = node.prev
    }

    func removeTail() -> DoublyLinkedListNode<Key, Value>? {
        if let tailNode = tail?.prev, tailNode !== head {
            removeNode(tailNode)
            return tailNode
        }
        return nil
    }
}

public class LRUCache<Key: Hashable, Value> {
    private var capacity: Int
    private var cache: [Key: DoublyLinkedListNode<Key, Value>]
    private var linkedList: DoublyLinkedList<Key, Value>

    init(capacity: Int) {
        self.capacity = capacity
        self.cache = [Key: DoublyLinkedListNode<Key, Value>]()
        self.linkedList = DoublyLinkedList<Key, Value>()
    }

    func get(_ key: Key) -> Value? {
        if let node = cache[key] {
            linkedList.removeNode(node)
            linkedList.addNodeToHead(node)
            return node.value
        }
        return nil
    }

    func put(_ key: Key, _ value: Value) {
        if let node = cache[key] {
            linkedList.removeNode(node)
            node.value = value
            linkedList.addNodeToHead(node)
        } else {
            if cache.count >= capacity, let tailNode = linkedList.removeTail() {
                cache.removeValue(forKey: tailNode.key)
            }
            let newNode = DoublyLinkedListNode(key: key, value: value)
            linkedList.addNodeToHead(newNode)
            cache[key] = newNode
        }
    }
}
